import sys

import server.apis.stable_diffusion_hijack.hijack_api_models as hijack_api_models
import modules.scripts

from fastapi import FastAPI
from modules import shared
from modules.sd_models import load_model
from modules.shared import opts
from modules.api import models
from modules.api.api import Api, decode_base64_to_image, validate_sampler_name, encode_pil_to_base64
from modules import scripts, ui
from fastapi.exceptions import HTTPException
from modules.processing import StableDiffusionProcessingImg2Img, StableDiffusionProcessingTxt2Img, process_images
from webui import initialize, setup_middleware
from modules.call_queue import queue_lock  # noqa: F401
from typing import List

import numpy as np
import torch
from PIL import Image


class hijackApi(Api):
    def __init__(self,  app: FastAPI) -> None:
        self.max_queue_job_num = 1
        self.queue_job_num = 0
        print(f"Launching {'API server' if '--nowebui' in sys.argv else 'Web UI'} with arguments: {' '.join(sys.argv[1:])}")
        self.init(app)
        
    def init(self, app: FastAPI):
        setup_middleware(app)
        initialize()
        super().__init__(app, queue_lock)
        self.add_api_route("/sdapi/v1/magic_draw", self.magicImgV2, methods=["POST"], response_model=hijack_api_models.MagicImgsResponse)
        self.add_api_route("/sdapi/v1/magic_txt2img", self.magic_txt2img, methods=["POST"], response_model=hijack_api_models.MagicImgsResponse)
        self.add_api_route("/sdapi/v1/magic_img2img", self.magic_img2img, methods=["POST"], response_model=hijack_api_models.MagicImgsResponse)
        self.add_api_route("/sdapi/v1/set_sd_model", self.setSdModel, methods=["POST"], response_model=hijack_api_models.SetModelResponse)
        self.add_api_route("/sdapi/v1/get_selected_model", self.get_selected_model, methods=["GET"], response_model=hijack_api_models.GetSelectedModelResponse)

        modules.script_callbacks.app_started_callback(None, app)

    def magicImgV2(self, magicimgreq: hijack_api_models.MagicImgRequestV2):
        """AI绘图后端接口V2版本，拆分融合的画笔为单独的 扩图|圈选重绘|涂抹重绘|图生图|草图出图 五个功能
        """
        if self.queue_job_num >= self.max_queue_job_num:
            return hijack_api_models.MagicImgsResponse(images=[], messeage="当前处理任务过多，请稍后再试")
        try:
            self.queue_job_num+=1
            # 判断
            processing_items: hijack_api_models.MagicProcessingItemsV2 = hijack_api_models.MagicProcessingItemsV2()
            processed_items: hijack_api_models.MagicImgsResponse = hijack_api_models.MagicImgsResponse()
            if magicimgreq.canvas_info.width < 8 or magicimgreq.canvas_info.height < 8:
                return hijack_api_models.MagicImgsResponse(images=[], messeage="图片尺寸长宽不能小于8像素")
            
            
            processing_items.canvas = Image.new('RGBA', (magicimgreq.canvas_info.width, magicimgreq.canvas_info.height), (0, 0, 0, 255))
            processing_items.canvas_info = magicimgreq.canvas_info.copy()
            
            script_runner = scripts.scripts_img2img

            if not script_runner.scripts:
                script_runner.initialize_scripts(True)
                ui.create_ui()
                
            if not self.default_script_arg_img2img:
                self.default_script_arg_img2img = self.init_default_script_args(script_runner)
            selectable_scripts, selectable_script_idx = self.get_selectable_script(None, script_runner)

            img2imgreq = models.StableDiffusionImg2ImgProcessingAPI()

            populate = img2imgreq.copy(update={  # Override __init__ params
                "sampler_name": validate_sampler_name(img2imgreq.sampler_name or img2imgreq.sampler_index),
                "do_not_save_samples": not img2imgreq.save_images,
                "do_not_save_grid": not img2imgreq.save_images,
                "mask": None,
                "alwayson_scripts":None,
            })

            if populate.sampler_name:
                populate.sampler_index = None  # prevent a warning later on

            args = vars(populate)
            args.pop('include_init_images', None)  # this is meant to be done by "exclude": True in model, but it's for a reason that I cannot determine.
            args.pop('script_name', None)
            args.pop('script_args', None)  # will refeed them to the pipeline directly after initializing them
            args.pop('alwayson_scripts', None)  # will refeed them to the pipeline directly after initializing them
            args.pop('send_images', True)
            args.pop('save_images', None)
            with self.queue_lock:
                p = StableDiffusionProcessingImg2Img(sd_model=shared.sd_model, **args)
                p.scripts = script_runner
                p.outpath_grids = opts.outdir_img2img_grids
                p.outpath_samples = opts.outdir_img2img_samples

                shared.state.begin()
                self._processed_image(p, magicimgreq, processing_items, img2imgreq, selectable_scripts, selectable_script_idx, script_runner)
                if processing_items.canvas_info.draw_type == hijack_api_models.EnumDrawType.img2img:
                    self.aifunc_img2img(p, magicimgreq, processing_items, img2imgreq, selectable_scripts, selectable_script_idx, script_runner, processed_items)
                elif processing_items.canvas_info.draw_type == hijack_api_models.EnumDrawType.handdraw or processing_items.canvas_info.draw_type == hijack_api_models.EnumDrawType.sketch2img:
                    self.aifunc_handdraw(p, magicimgreq, processing_items, img2imgreq, selectable_scripts, selectable_script_idx, script_runner, processed_items)
                elif processing_items.canvas_info.draw_type == hijack_api_models.EnumDrawType.expand_rect:
                    self.aifunc_expand_rect(p, magicimgreq, processing_items, img2imgreq, selectable_scripts, selectable_script_idx, script_runner, processed_items)
                elif processing_items.canvas_info.draw_type == hijack_api_models.EnumDrawType.lasso_inpaint:
                    self.aifunc_lasso_inpaint(p, magicimgreq, processing_items, img2imgreq, selectable_scripts, selectable_script_idx, script_runner, processed_items)
                elif processing_items.canvas_info.draw_type == hijack_api_models.EnumDrawType.inpaint:
                    self.aifunc_inpaint(p, magicimgreq, processing_items, img2imgreq, selectable_scripts, selectable_script_idx, script_runner, processed_items)

                shared.state.end()
                undo_controlnet_hijack(p)
        except:
            pass
        
        self.queue_job_num-=1

        return processed_items

    def _processed_image(self, p, magicimgreq: hijack_api_models.MagicImgRequestV2, processing_items: hijack_api_models.MagicProcessingItemsV2, img2imgreq: models.StableDiffusionProcessingImg2Img, selectable_scripts, selectable_script_idx, script_runner):
        # ######### 第一阶段裁剪图片，把在canvas外面的image进行裁剪 ######### #
        for img_item in magicimgreq.imgs:
            if img_item.image_type in [hijack_api_models.EnumDrawType.inpaint, hijack_api_models.EnumDrawType.lasso_inpaint]:
                img = decode_base64_to_image(img_item.src)
                new_img_info = crop_image_v3(img, img_item, magicimgreq.canvas_info)
                processing_items.combine_layers.append(new_img_info)
            else:
                img = resize_to_nearest_multiple_of_8(decode_base64_to_image(img_item.src))
                processing_items.combine_layers.append(
                    hijack_api_models.ProcessedImageItemV2(
                        image=img, 
                        image_type=img_item.image_type, 
                        height=img.height,
                        width=img.width,
                        top=img_item.top,
                        left=img_item.left,
                        rel_top=0,
                        rel_left=0
                    )
                )

    def aifunc_img2img(self, p, magicimgreq: hijack_api_models.MagicImgRequestV2, processing_items: hijack_api_models.MagicProcessingItemsV2, img2imgreq: models.StableDiffusionProcessingImg2Img, selectable_scripts, selectable_script_idx, script_runner, processed_items:hijack_api_models.MagicImgsResponse):
        for index, img_item in enumerate(processing_items.combine_layers):
            if img_item.image_type == hijack_api_models.EnumDrawType.image:
                if img_item.width < 5 or img_item.height < 5:
                    pass
                else:
                    p.init_images = [img_item.image]

            if img_item.image_type == "img2img" and processing_items.canvas_info.denoising_strength > 0:
                p.width = img_item.width
                p.height = img_item.height
                p.prompt = processing_items.canvas_info.prompt
                p.negative_prompt = processing_items.canvas_info.neg_prompt
                p.denoising_strength = processing_items.canvas_info.denoising_strength
                p.steps = processing_items.canvas_info.steps
                p.n_iter = processing_items.canvas_info.n_iter

        if len(p.init_images)<=0:
            return 

        extendreq = img2imgreq.copy(update={
            "width": p.width,
            "height": p.height,
            "prompt": p.prompt,
            "negative_prompt": p.negative_prompt,
            "steps": p.steps,
            "n_iter": p.n_iter,
            "denoising_strength": p.denoising_strength,
            "alwayson_scripts": None
        })

        script_args = self.init_script_args(extendreq, self.default_script_arg_img2img, selectable_scripts, selectable_script_idx, script_runner)
        
        p.script_args = tuple(script_args) # Need to pass args as tuple here
        processed = process_images(p)
        # processed_img_item = img_item.copy(update={
        #     "image": processed.images
        # })
        # processing_items.combine_layers[index] = processed_img_item
        processed_items.images.append(hijack_api_models.MagicImgResponse(images=list(map(encode_pil_to_base64, processed.images)), parameters=vars(extendreq), info=processed.js(), messeage="完成相应图生图生成"))

    def aifunc_handdraw(self, p, magicimgreq: hijack_api_models.MagicImgRequestV2, processing_items: hijack_api_models.MagicProcessingItemsV2, img2imgreq: models.StableDiffusionProcessingImg2Img, selectable_scripts, selectable_script_idx, script_runner, processed_items:hijack_api_models.MagicImgsResponse):
        sketch_canvas = None

        for img_item in processing_items.combine_layers:
            if img_item.image_type in [hijack_api_models.EnumDrawType.handdraw, hijack_api_models.EnumDrawType.image]:
                sketch_canvas = Image.new('RGBA', (img_item.image.width, img_item.image.height), (255, 255, 255, 0))
                sketch_canvas.paste(img_item.image, (img_item.rel_left, img_item.rel_top))

        if sketch_canvas:
            for img_item in processing_items.combine_layers:
                if img_item.image_type in [hijack_api_models.EnumDrawType.handdraw, hijack_api_models.EnumDrawType.sketch2img]:
                    alwayson_scripts = {
                            "ControlNet":{
                                "args": ([{
                                    "module": "tile_resample", # 注意调整
                                    "model": "control_v11f1e_sd15_tile [a371b31b]", # 注意调整
                                    "weight": 1.0,
                                    "image": {
                                        "image": np.asarray(sketch_canvas).astype(np.uint8),
                                        "mask":  np.asarray(Image.new('RGBA', (img_item.image.width, img_item.image.height), (0, 0, 0, 255))).astype(np.uint8), 
                                    },
                                    "resize_mode": 2,
                                    "lowvram": False,
                                    "processor_res": -1,
                                    "threshold_a": -1,
                                    "threshold_b": -1,
                                    "guidance_start": 0.0,
                                    "guidance_end": 1.0,
                                    "control_mode": "ControlNet is more important",
                                    "pixel_perfect": True,
                                }])
                            }
                        }
            
                    p.init_images = [sketch_canvas] 
                    p.width = sketch_canvas.width
                    p.height = sketch_canvas.height
                    p.prompt = processing_items.canvas_info.prompt
                    p.negative_prompt = processing_items.canvas_info.neg_prompt
                    p.denoising_strength = processing_items.canvas_info.denoising_strength
                    p.steps = processing_items.canvas_info.steps
                    p.n_iter = processing_items.canvas_info.n_iter
                    extendreq = img2imgreq.copy(update={
                        "width": p.width,
                        "height": p.height,
                        "prompt": p.prompt,
                        "negative_prompt": p.negative_prompt,
                        "steps": p.steps,
                        "n_iter": p.n_iter,
                        "denoising_strength": p.denoising_strength,
                        "alwayson_scripts": alwayson_scripts
                    })

                    script_args = self.init_script_args(extendreq, self.default_script_arg_img2img, selectable_scripts, selectable_script_idx, script_runner)

                    p.script_args = tuple(script_args) # Need to pass args as tuple here
        

            processed = process_images(p)
            processed_items.images.append(hijack_api_models.MagicImgResponse(images=list(map(encode_pil_to_base64, processed.images)), parameters=vars(img2imgreq), info=processed.js(), messeage="完成草图生成"))

    def aifunc_expand_rect(self, p, magicimgreq: hijack_api_models.MagicImgRequestV2, processing_items: hijack_api_models.MagicProcessingItemsV2, img2imgreq: models.StableDiffusionProcessingImg2Img, selectable_scripts, selectable_script_idx, script_runner, processed_items:hijack_api_models.MagicImgsResponse):
        canvas = None
        expand_mask = None
        img = None
        img_left = 0
        img_top = 0
        expand_left = 0
        expand_top = 0

        for img_item in processing_items.combine_layers:
            if img_item.image_type == hijack_api_models.EnumDrawType.image:
                img = img_item.image
                img_left = img_item.left
                img_top = img_item.top
            elif img_item.image_type == hijack_api_models.EnumDrawType.expand_rect:
                expand_left = img_item.left
                expand_top = img_item.top
                canvas = Image.new('RGBA', (img_item.image.width, img_item.image.height), (0, 0, 0, 255))
                expand_mask = Image.new('RGBA', (img_item.image.width, img_item.image.height), (255, 255, 255, 0))

        img_full = Image.new('RGBA', (canvas.width, canvas.height), (255, 255, 255, 0))
        img_full.paste(img, (abs(expand_left-img_left), abs(expand_top-img_top)))
        expand_mask = Image.alpha_composite(expand_mask, img_full) 
        canvas =  Image.alpha_composite(canvas, img_full) 

        expand_mask_np = np.array(expand_mask)
        # 将mask非透明区域设置为透明的，透明区域变成白色
        color_pos = expand_mask_np[:,:,3] != 0
        trans_pos = expand_mask_np[:,:,3] == 0
        expand_mask_np[color_pos] = [0,0,0,0]
        expand_mask_np[trans_pos] = [255,255,255,255]
        expand_mask = Image.fromarray(expand_mask_np)

        # 将canvas透明区域填充为白色
        alwayson_scripts = {
            "ControlNet":{
                "args": ([{
                    "module": "inpaint_only+lama", # 注意调整
                    "model": "control_v11p_sd15_inpaint [ebff9138]", # 注意调整
                    "weight": 1.0,
                    "image": {
                        "image": np.asarray(canvas).astype(np.uint8),
                        "mask": np.asarray(expand_mask).astype(np.uint8),
                    },
                    "resize_mode": 2,
                    "lowvram": False,
                    "processor_res": -1,
                    "threshold_a": -1,
                    "threshold_b": -1,
                    "guidance_start": 0.0,
                    "guidance_end": 1.0,
                    "control_mode": "ControlNet is more important",
                    "pixel_perfect": True,
                }])
            }
        }

        p.init_images = [img]
        p.width = canvas.width
        p.height = canvas.height

        p.prompt = processing_items.canvas_info.prompt
        p.negative_prompt = processing_items.canvas_info.neg_prompt
        p.denoising_strength = processing_items.canvas_info.denoising_strength
        p.steps = processing_items.canvas_info.steps
        p.n_iter = processing_items.canvas_info.n_iter

        extendreq = img2imgreq.copy(update={
            "width": p.width,
            "height": p.height,
            "prompt": p.prompt,
            "negative_prompt": p.negative_prompt,
            "steps": p.steps,
            "n_iter": p.n_iter,
            "denoising_strength": p.denoising_strength,
            "alwayson_scripts": alwayson_scripts
        })

        script_args = self.init_script_args(extendreq, self.default_script_arg_img2img, selectable_scripts, selectable_script_idx, script_runner)
        
        p.script_args = tuple(script_args) # Need to pass args as tuple here
        processed = process_images(p)

        processed_items.images.append(hijack_api_models.MagicImgResponse(images=list(map(encode_pil_to_base64, processed.images)), parameters=vars(img2imgreq), info=processed.js(), messeage="完成扩图绘画"))

    def aifunc_lasso_inpaint(self, p, magicimgreq: hijack_api_models.MagicImgRequestV2, processing_items: hijack_api_models.MagicProcessingItemsV2, img2imgreq: models.StableDiffusionProcessingImg2Img, selectable_scripts, selectable_script_idx, script_runner, processed_items:hijack_api_models.MagicImgsResponse):
        mask_img = None
        img = None
        img_left = 0
        img_top = 0
        inpaint_left = 0
        inpaint_top = 0

        for img_item in processing_items.combine_layers:
            if img_item.image_type == hijack_api_models.EnumDrawType.lasso_inpaint:
                mask_img = img_item.image
                inpaint_left = img_item.left
                inpaint_top = img_item.top

            elif img_item.image_type == hijack_api_models.EnumDrawType.image:
                img = img_item.image
                img_left = img_item.left
                img_top = img_item.top

        mask = Image.new('RGBA', (img.width, img.height), (0, 0, 0, 0))
        mask.paste(mask_img, (abs(img_left-inpaint_left), abs(img_top-inpaint_top)))
        mask_array  = np.array(mask)
        # 设置符合条件的像素点的颜色
        non_transparent_pixels = mask_array[:, :, 3] != 0
        transparent_pixels = mask_array[:, :, 3] == 0
        # 全部反转
        mask_array[non_transparent_pixels] = [255, 255, 255, 255]
        mask_array[transparent_pixels] = [0, 0, 0, 255]
        mask = Image.fromarray(mask_array)

        alwayson_scripts = {
            "ControlNet":{
                "args": ([{
                    "module": "inpaint_only", # 注意调整
                    "model": "control_v11p_sd15_inpaint [ebff9138]", # 注意调整
                    "weight": 1.0,
                    "image": {
                        "image": np.asarray(img).astype(np.uint8),
                        "mask":  np.asarray(mask).astype(np.uint8), 
                    },
                    "resize_mode": 2,
                    "lowvram": False,
                    "processor_res": -1,
                    "threshold_a": -1,
                    "threshold_b": -1,
                    "guidance_start": 0.0,
                    "guidance_end": 1.0,
                    "control_mode": "ControlNet is more important",
                    "pixel_perfect": True,
                }])
            }
        }

        p.init_images = [img] 
        p.image_mask = mask
        p.width = img.width
        p.height = img.height
        p.prompt = processing_items.canvas_info.prompt
        p.negative_prompt = processing_items.canvas_info.neg_prompt
        p.denoising_strength = processing_items.canvas_info.denoising_strength
        p.steps = processing_items.canvas_info.steps
        p.n_iter = processing_items.canvas_info.n_iter
        p.inpainting_fill = 1
        # p.inpaint_full_res = False
        extendreq = img2imgreq.copy(update={
            "width": p.width,
            "height": p.height,
            "prompt": p.prompt,
            "negative_prompt": p.negative_prompt,
            "steps": p.steps,
            "n_iter": p.n_iter,
            "denoising_strength": p.denoising_strength,
            "alwayson_scripts": alwayson_scripts
        })

        script_args = self.init_script_args(extendreq, self.default_script_arg_img2img, selectable_scripts, selectable_script_idx, script_runner)

        p.script_args = tuple(script_args) # Need to pass args as tuple here
        processed = process_images(p)
        processed_items.images.append(hijack_api_models.MagicImgResponse(images=list(map(encode_pil_to_base64, processed.images)), parameters=vars(img2imgreq), info=processed.js(), messeage="完成局部重绘"))
    
    def aifunc_inpaint(self, p, magicimgreq: hijack_api_models.MagicImgRequestV2, processing_items: hijack_api_models.MagicProcessingItemsV2, img2imgreq: models.StableDiffusionProcessingImg2Img, selectable_scripts, selectable_script_idx, script_runner, processed_items:hijack_api_models.MagicImgsResponse):
        mask_img = None
        img = None
        img_left = 0
        img_top = 0
        inpaint_left = 0
        inpaint_top = 0

        for img_item in processing_items.combine_layers:
            if img_item.image_type == hijack_api_models.EnumDrawType.inpaint:
                mask_img = img_item.image
                inpaint_left = img_item.left
                inpaint_top = img_item.top

            elif img_item.image_type == hijack_api_models.EnumDrawType.image:
                img = img_item.image
                img_left = img_item.left
                img_top = img_item.top

        mask = Image.new('RGBA', (img.width, img.height), (0, 0, 0, 0))
        mask.paste(mask_img, (abs(img_left-inpaint_left), abs(img_top-inpaint_top)))
        # 临时底图
        mask_canvas = Image.alpha_composite(img, mask) 
        mask_array  = np.array(mask)
        # 设置符合条件的像素点的颜色
        non_transparent_pixels = mask_array[:, :, 3] != 0
        transparent_pixels = mask_array[:, :, 3] == 0
        # 全部反转
        mask_array[non_transparent_pixels] = [255, 255, 255, 255]
        mask_array[transparent_pixels] = [0, 0, 0, 255]
        mask = Image.fromarray(mask_array)

        alwayson_scripts = {
            "ControlNet":{
                "args": ([{
                    "module": "inpaint_only", # 注意调整
                    "model": "control_v11p_sd15_inpaint [ebff9138]", # 注意调整
                    "weight": 1.0,
                    "image": {
                        "image": np.asarray(mask_canvas).astype(np.uint8),
                        "mask":  np.asarray(mask).astype(np.uint8), 
                    },
                    "resize_mode": 2,
                    "lowvram": False,
                    "processor_res": -1,
                    "threshold_a": -1,
                    "threshold_b": -1,
                    "guidance_start": 0.0,
                    "guidance_end": 1.0,
                    "control_mode": "ControlNet is more important",
                    "pixel_perfect": True,
                }])
            }
        }
        p.init_images = [mask_canvas] 
        p.image_mask = mask
        p.width = mask_canvas.width
        p.height = mask_canvas.height
        p.prompt = processing_items.canvas_info.prompt
        p.negative_prompt = processing_items.canvas_info.neg_prompt
        p.denoising_strength = processing_items.canvas_info.denoising_strength
        p.steps = processing_items.canvas_info.steps
        p.n_iter = processing_items.canvas_info.n_iter
        p.inpainting_fill = 1
        # p.inpaint_full_res = False
        extendreq = img2imgreq.copy(update={
            "width": p.width,
            "height": p.height,
            "prompt": p.prompt,
            "negative_prompt": p.negative_prompt,
            "steps": p.steps,
            "n_iter": p.n_iter,
            "denoising_strength": p.denoising_strength,
            "alwayson_scripts": alwayson_scripts
        })

        script_args = self.init_script_args(extendreq, self.default_script_arg_img2img, selectable_scripts, selectable_script_idx, script_runner)

        p.script_args = tuple(script_args) # Need to pass args as tuple here
        processed = process_images(p)
        processed_items.images.append(hijack_api_models.MagicImgResponse(images=list(map(encode_pil_to_base64, processed.images)), parameters=vars(img2imgreq), info=processed.js(), messeage="完成局部重绘"))


    def magic_txt2img(self, txt2imgreq: hijack_api_models.Txt2imgRequest):
        if self.queue_job_num >= self.max_queue_job_num:
            return hijack_api_models.MagicImgsResponse(images=[], messeage="当前处理任务过多，请稍后再试")
        
        self.queue_job_num+=1
        try:
            org_txt2imgreq = models.StableDiffusionTxt2ImgProcessingAPI()
            re_org_txt2imgreq = org_txt2imgreq.copy(update={  # Override __init__ params
                "prompt": txt2imgreq.prompt,
                "negative_prompt": txt2imgreq.negative_prompt,
                "cfg_scale": txt2imgreq.cfg_scale,
                "height": txt2imgreq.height,
                "width": txt2imgreq.width,
                "n_iter": txt2imgreq.n_iter,
                "steps": txt2imgreq.steps,
                "seed": txt2imgreq.seed,
            })
            result = self.text2imgapi(re_org_txt2imgreq)        
            processed_items: hijack_api_models.MagicImgsResponse = hijack_api_models.MagicImgsResponse()
            processed_items.images.append(hijack_api_models.MagicImgResponse(images=result.images, parameters=result.parameters, info=result.info, messeage="完成扩图绘画"))
        except:
            processed_items: hijack_api_models.MagicImgsResponse = hijack_api_models.MagicImgsResponse(images=[], messeage="处理失败")
        self.queue_job_num-=1
        return processed_items 
    
    def magic_img2img(self, img2imgreq: hijack_api_models.Img2imgRequest):
        # 如果没有传入图片那么调用文生图
        if img2imgreq.init_image == "":
            return self.magic_txt2img(hijack_api_models.Txt2imgRequest(
                fname = "sd"
                , prompt = img2imgreq.prompt
                , negative_prompt = img2imgreq.negative_prompt
                , cfg_scale = img2imgreq.cfg_scale
                , height = img2imgreq.height
                , width = img2imgreq.width
                , n_iter = img2imgreq.n_iter
                , steps = img2imgreq.steps
                , seed = img2imgreq.seed
            ))
        else:
            org_img2imgreq = models.StableDiffusionImg2ImgProcessingAPI()
            re_org_img2imgreq = org_img2imgreq.copy(update={  # Override __init__ params
                "prompt": img2imgreq.prompt,
                "negative_prompt": img2imgreq.negative_prompt,
                "cfg_scale": img2imgreq.cfg_scale,
                "height": img2imgreq.height,
                "width": img2imgreq.width,
                "n_iter": img2imgreq.n_iter,
                "steps": img2imgreq.steps,
                "seed": img2imgreq.seed,
                "init_images": [img2imgreq.init_image],
                "denoising_strength": img2imgreq.denoising_strength,
                "include_init_images": False
            })

            result = self.img2imgapi(re_org_img2imgreq)        
            processed_items: hijack_api_models.MagicImgsResponse = hijack_api_models.MagicImgsResponse()
            processed_items.images.append(hijack_api_models.MagicImgResponse(images=result.images, parameters=result.parameters, info=result.info, messeage="完成扩图绘画"))
            return processed_items 
    
    # （已废弃）V1全智能版本绘画流程函数
    def magicImg(self, magicimgreq: hijack_api_models.MagicImgRequest):
        # 判断
        processing_items: hijack_api_models.MagicProcessingItems = hijack_api_models.MagicProcessingItems()
        processed_items: hijack_api_models.MagicImgsResponse = hijack_api_models.MagicImgsResponse()
        if magicimgreq.canvas_info.width < 8 or magicimgreq.canvas_info.height < 8:
            return hijack_api_models.MagicImgsResponse(images=[], messeage="图片尺寸长宽不能小于8像素")
        
        # 没有任何底图，且
        if magicimgreq.canvas_info.denoising_strength > 0 and magicimgreq.canvas_info.txt2img == 1:
            self.pipeline_txt2img(magicimgreq, processing_items, processed_items)
        else: # 进行图生图
            processing_items.canvas = Image.new('RGBA', (magicimgreq.canvas_info.width, magicimgreq.canvas_info.height), (0, 0, 0, 255))

        # 修正canvas信息
        magicimgreq.canvas_info.width = processing_items.canvas.width
        magicimgreq.canvas_info.height = processing_items.canvas.height
        processing_items.canvas_info = magicimgreq.canvas_info.copy()
        

        script_runner = scripts.scripts_img2img

        if not script_runner.scripts:
            script_runner.initialize_scripts(True)
            ui.create_ui()
            
        if not self.default_script_arg_img2img:
            self.default_script_arg_img2img = self.init_default_script_args(script_runner)
        selectable_scripts, selectable_script_idx = self.get_selectable_script(None, script_runner)

        img2imgreq = models.StableDiffusionImg2ImgProcessingAPI()

        populate = img2imgreq.copy(update={  # Override __init__ params
            "sampler_name": validate_sampler_name(img2imgreq.sampler_name or img2imgreq.sampler_index),
            "do_not_save_samples": not img2imgreq.save_images,
            "do_not_save_grid": not img2imgreq.save_images,
            "mask": None,
            "alwayson_scripts":None,
        })

        if populate.sampler_name:
            populate.sampler_index = None  # prevent a warning later on

        args = vars(populate)
        args.pop('include_init_images', None)  # this is meant to be done by "exclude": True in model, but it's for a reason that I cannot determine.
        args.pop('script_name', None)
        args.pop('script_args', None)  # will refeed them to the pipeline directly after initializing them
        args.pop('alwayson_scripts', None)  # will refeed them to the pipeline directly after initializing them
        args.pop('send_images', True)
        args.pop('save_images', None)

        with self.queue_lock:
            p = StableDiffusionProcessingImg2Img(sd_model=shared.sd_model, **args)
            p.scripts = script_runner
            p.outpath_grids = opts.outdir_img2img_grids
            p.outpath_samples = opts.outdir_img2img_samples

            shared.state.begin()
            self.pipeline_crop_img(p, magicimgreq, processing_items, img2imgreq, selectable_scripts, selectable_script_idx, script_runner)
            self.pipeline_img2img(p, magicimgreq, processing_items, img2imgreq, selectable_scripts, selectable_script_idx, script_runner, processed_items)
            self.pipeline_recombine_canvas(p, magicimgreq, processing_items, img2imgreq, selectable_scripts, selectable_script_idx, script_runner, processed_items)
            self.pipeline_expand2img(p, magicimgreq, processing_items, img2imgreq, selectable_scripts, selectable_script_idx, script_runner, processed_items)
            self.pipeline_inpaint2img(p, magicimgreq, processing_items, img2imgreq, selectable_scripts, selectable_script_idx, script_runner, processed_items)
            
            shared.state.end()

        undo_controlnet_hijack(p)
        return processed_items

    def test2img(self, p, magicimgreq: hijack_api_models.MagicImgRequest, img2imgreq:models.StableDiffusionImg2ImgProcessingAPI, selectable_scripts, selectable_script_idx, script_runner):
        b64images =[]
        # 按顺序裁剪出底图
        for img_item in magicimgreq.imgs:
            b64images.append(img_item.src)
                
        
        return b64images

    def pipeline_txt2img(self, magicimgreq: hijack_api_models.MagicImgRequest, processing_items: hijack_api_models.MagicProcessingItems, processed_items:hijack_api_models.MagicImgsResponse):
        canvas_width = magicimgreq.canvas_info.width
        canvas_height = magicimgreq.canvas_info.height

        script_runner = scripts.scripts_txt2img
        if not script_runner.scripts:
            script_runner.initialize_scripts(False)
            ui.create_ui()

        if not self.default_script_arg_txt2img:
            self.default_script_arg_txt2img = self.init_default_script_args(script_runner)
        selectable_scripts, selectable_script_idx = self.get_selectable_script(None, script_runner)

        txt2imgreq = models.StableDiffusionTxt2ImgProcessingAPI(
            width = canvas_width,
            height = canvas_height,
            prompt = magicimgreq.canvas_info.prompt,
            negative_prompt = magicimgreq.canvas_info.neg_prompt,
            steps = 20,
            denoising_strength = magicimgreq.canvas_info.denoising_strength
        )
        populate = txt2imgreq.copy(update={  # Override __init__ params
            "sampler_name": validate_sampler_name(txt2imgreq.sampler_name or txt2imgreq.sampler_index),
            "do_not_save_samples": not txt2imgreq.save_images,
            "do_not_save_grid": not txt2imgreq.save_images,
        })

        if populate.sampler_name:
            populate.sampler_index = None  # prevent a warning later on

        args = vars(populate)
        args.pop('script_name', None)
        args.pop('script_args', None) # will refeed them to the pipeline directly after initializing them
        args.pop('alwayson_scripts', None)

        script_args = self.init_script_args(txt2imgreq, self.default_script_arg_txt2img, selectable_scripts, selectable_script_idx, script_runner)

        send_images = args.pop('send_images', True)
        args.pop('save_images', None)

        with self.queue_lock:
            p = StableDiffusionProcessingTxt2Img(sd_model=shared.sd_model, **args)
            p.scripts = script_runner
            p.outpath_grids = opts.outdir_txt2img_grids
            p.outpath_samples = opts.outdir_txt2img_samples
            shared.state.begin()
            p.script_args = tuple(script_args) # Need to pass args as tuple here
            processed = process_images(p)
            shared.state.end()

        processing_items.canvas = processed.images[0].convert("RGBA")

        # 不用修正，在主线统一修正
        # if processing_items.canvas.width != processing_items.canvas_info.width or processing_items.canvas.height != processing_items.canvas_info.height:
        #     processing_items.canvas_info.width = processing_items.canvas.width
        #     processing_items.canvas_info.height = processing_items.canvas.height

        processed_items.images.append(hijack_api_models.MagicImgResponse(images=[encode_pil_to_base64(processing_items.canvas)], parameters=vars(txt2imgreq), info=processed.js(), messeage="完成图生图底图绘制"))

    def pipeline_crop_img(self, p, magicimgreq: hijack_api_models.MagicImgRequest, processing_items: hijack_api_models.MagicProcessingItems, img2imgreq: models.StableDiffusionProcessingImg2Img, selectable_scripts, selectable_script_idx, script_runner):
        # ######### 第一阶段裁剪图片，把在canvas外面的image进行裁剪 ######### #
        for img_item in magicimgreq.imgs:
            if img_item.image_type == "image" or img_item.image_type == "brush_group":
                img = decode_base64_to_image(img_item.src)
                new_img_info = crop_image_v2(img, img_item, magicimgreq.canvas_info)
                
                if new_img_info != False and not np.all(np.array(img)[:, :, 3] == 0): # 过滤裁剪后不存在图片和全透明图片
                    processing_items.combine_layers.append(new_img_info)

    def pipeline_img2img(self, p, magicimgreq: hijack_api_models.MagicImgRequest, processing_items: hijack_api_models.MagicProcessingItems, img2imgreq: models.StableDiffusionProcessingImg2Img, selectable_scripts, selectable_script_idx, script_runner, processed_items:hijack_api_models.MagicImgsResponse):

        # ######### 第二阶段图生图，看是否有需要单独图生图的image ######### #
        for index, img_item in enumerate(processing_items.combine_layers):
            if img_item.image_type == "image" and img_item.denoising_strength > 0:
                if img_item.width < 5 or img_item.height < 5:
                    pass
                else:
                    p.init_images = [img_item.image]
                    p.width = img_item.width
                    p.height = img_item.height
                    p.prompt = img_item.prompt
                    p.negative_prompt = img_item.neg_prompt
                    p.steps = 20
                    p.denoising_strength = img_item.denoising_strength
    
                    extendreq = img2imgreq.copy(update={
                        "width": p.width,
                        "height": p.height,
                        "prompt": p.prompt,
                        "negative_prompt": p.negative_prompt,
                        "steps": p.steps,
                        "denoising_strength": p.denoising_strength,
                        "alwayson_scripts": None
                    })

                    script_args = self.init_script_args(extendreq, self.default_script_arg_img2img, selectable_scripts, selectable_script_idx, script_runner)
                    
                    p.script_args = tuple(script_args) # Need to pass args as tuple here
                    processed = process_images(p)
                    processed_img_item = img_item.copy(update={
                        "image": processed.images[0]
                    })
                    processing_items.combine_layers[index] = processed_img_item
                    processed_items.images.append(hijack_api_models.MagicImgResponse(images=[encode_pil_to_base64(processed_img_item.image)], parameters=vars(extendreq), info=processed.js(), messeage="完成相应图生图生成"))

    def pipeline_recombine_canvas(self, p, magicimgreq: hijack_api_models.MagicImgRequest, processing_items: hijack_api_models.MagicProcessingItems, img2imgreq: models.StableDiffusionProcessingImg2Img, selectable_scripts, selectable_script_idx, script_runner, processed_items:hijack_api_models.MagicImgsResponse):
        """将canvas上面的元素和image合并,形成真正的底图，并且
        """
        expand_mask = Image.new('RGBA', (processing_items.canvas_info.width, processing_items.canvas_info.height), (255, 255, 255, 0))
        crop_coor = [None, None, None, None]
        for img_item in processing_items.combine_layers:
            if img_item.image_type == "image":
                # 如果新的intersect_left小于旧的则更新
                if crop_coor[0] is None or crop_coor[0] > img_item.left:
                    crop_coor[0] = img_item.left

                if crop_coor[1] is None or crop_coor[1] > img_item.top:
                    crop_coor[1] = img_item.top

                if crop_coor[2] is None or crop_coor[2] < img_item.left+img_item.width:
                    crop_coor[2] = img_item.left+img_item.width

                if crop_coor[3] is None or crop_coor[3] < img_item.top+img_item.height:
                    crop_coor[3] = img_item.top+img_item.height

                img_full = Image.new('RGBA', (processing_items.canvas_info.width, processing_items.canvas_info.height), (255, 255, 255, 0))
                img_full.paste(img_item.image, (img_item.rel_left, img_item.rel_top))
                expand_mask = Image.alpha_composite(expand_mask, img_full) 
                processing_items.canvas =  Image.alpha_composite(processing_items.canvas, img_full) 

            elif img_item.image_type == "brush_group":
                pass
                # img_full = Image.new('RGBA', (processing_items.canvas_info.width, processing_items.canvas_info.height), (255, 255, 255, 0))
                # img_full.paste(img_item.image, (img_item.rel_left, img_item.rel_top))
        
        if any(x is None for x in crop_coor):
            processing_items.expand_mask = None
            processing_items.expand_canvas = None
            return 
        
        crop_coor[0] = crop_coor[0]-processing_items.canvas_info.left
        crop_coor[1] = crop_coor[1]-processing_items.canvas_info.top
        crop_coor[2] = crop_coor[2]-processing_items.canvas_info.left
        crop_coor[3] = crop_coor[3]-processing_items.canvas_info.top

        # 当前拼接的底图传入
        processed_items.images.append(hijack_api_models.MagicImgResponse(images=[encode_pil_to_base64(processing_items.canvas)], parameters={}, info="", messeage="完成相应底图拼接"))

        crop_canvas = processing_items.canvas.crop(crop_coor)
        # ######### 第三阶段扩图 ######### #
        # 如果坐标有变化，说明需要扩图
        if crop_canvas.width < processing_items.canvas.width or crop_canvas.height < processing_items.canvas.height:
            processing_items.expand_mask = expand_mask
            processing_items.expand_canvas = crop_canvas
        else:
            processing_items.expand_mask = None
            processing_items.expand_canvas = None
        
    def pipeline_expand2img(self, p, magicimgreq: hijack_api_models.MagicImgRequest, processing_items: hijack_api_models.MagicProcessingItems, img2imgreq: models.StableDiffusionProcessingImg2Img, selectable_scripts, selectable_script_idx, script_runner, processed_items:hijack_api_models.MagicImgsResponse):
        if processing_items.expand_mask == None or processing_items.expand_canvas == None:
            return 
        
        expand_mask_np = np.array(processing_items.expand_mask)
        # 将mask非透明区域设置为透明的，透明区域变成白色
        color_pos = expand_mask_np[:,:,3] != 0
        trans_pos = expand_mask_np[:,:,3] == 0
        expand_mask_np[color_pos] = [0,0,0,0]
        expand_mask_np[trans_pos] = [255,255,255,255]
        processing_items.expand_mask = Image.fromarray(expand_mask_np)

        # 将canvas透明区域填充为白色
        alwayson_scripts = {
            "ControlNet":{
                "args": ([{
                    "module": "inpaint_only+lama", # 注意调整
                    "model": "control_v11p_sd15_inpaint [ebff9138]", # 注意调整
                    "weight": 1.0,
                    "image": {
                        "image": np.asarray(processing_items.canvas).astype(np.uint8),
                        "mask": np.asarray(processing_items.expand_mask).astype(np.uint8),
                    },
                    "resize_mode": 2,
                    "lowvram": False,
                    "processor_res": -1,
                    "threshold_a": -1,
                    "threshold_b": -1,
                    "guidance_start": 0.0,
                    "guidance_end": 1.0,
                    "control_mode": "ControlNet is more important",
                    "pixel_perfect": True,
                }])
            }
        }

        p.init_images = [processing_items.expand_canvas]
        p.width = processing_items.canvas_info.width
        p.height = processing_items.canvas_info.height
        p.prompt = processing_items.canvas_info.prompt
        p.negative_prompt = processing_items.canvas_info.neg_prompt
        p.steps = 20
        p.denoising_strength = processing_items.canvas_info.denoising_strength

        extendreq = img2imgreq.copy(update={
            "width": p.width,
            "height": p.height,
            "prompt": p.prompt,
            "negative_prompt": p.negative_prompt,
            "steps": p.steps,
            "denoising_strength": p.denoising_strength,
            "alwayson_scripts": alwayson_scripts
        })

        script_args = self.init_script_args(extendreq, self.default_script_arg_img2img, selectable_scripts, selectable_script_idx, script_runner)
        
        p.script_args = tuple(script_args) # Need to pass args as tuple here
        processed = process_images(p)
        processing_items.canvas = processed.images[0]
        _before_expand_canvas = processed.images[1] # 带上mask信息的图片
        # expand后尺寸可能有几个像素级别的改变，需要缩放到一致
        if processing_items.canvas.width != processing_items.canvas_info.width or processing_items.canvas.height != processing_items.canvas_info.height:
            processing_items.canvas_info.width = processing_items.canvas.width
            processing_items.canvas_info.height = processing_items.canvas.height
            # processed_images += [encode_pil_to_base64(crop_canvas), encode_pil_to_base64(canvas)]
        processed_items.images.append(hijack_api_models.MagicImgResponse(images=[encode_pil_to_base64(processing_items.canvas)], parameters=vars(img2imgreq), info=processed.js(), messeage="完成扩图绘画"))

    def pipeline_inpaint2img(self, p, magicimgreq: hijack_api_models.MagicImgRequest, processing_items: hijack_api_models.MagicProcessingItems, img2imgreq: models.StableDiffusionProcessingImg2Img, selectable_scripts, selectable_script_idx, script_runner, processed_items:hijack_api_models.MagicImgsResponse):
        for img_item in processing_items.combine_layers:
            if img_item.image_type == "brush_group" and img_item.mask_type == "origin":
                mask = Image.new('RGBA', (processing_items.canvas_info.width, processing_items.canvas_info.height), (0, 0, 0, 0))
                mask.paste(img_item.image, (img_item.rel_left, img_item.rel_top))
                mask_array  = np.array(mask)
                # 设置符合条件的像素点的颜色
                non_transparent_pixels = mask_array[:, :, 3] != 0
                transparent_pixels = mask_array[:, :, 3] == 0
                # 全部反转
                mask_array[non_transparent_pixels] = [255, 255, 255, 255]
                mask_array[transparent_pixels] = [0, 0, 0, 255]
                mask = Image.fromarray(mask_array)
                alwayson_scripts = {
                    "ControlNet":{
                        "args": ([{
                            "module": "inpaint_only", # 注意调整
                            "model": "control_v11p_sd15_inpaint [ebff9138]", # 注意调整
                            "weight": 1.0,
                            "image": {
                                "image": np.asarray(processing_items.canvas).astype(np.uint8),
                                "mask":  np.asarray(mask).astype(np.uint8), 
                            },
                            "resize_mode": 2,
                            "lowvram": False,
                            "processor_res": -1,
                            "threshold_a": -1,
                            "threshold_b": -1,
                            "guidance_start": 0.0,
                            "guidance_end": 1.0,
                            "control_mode": "ControlNet is more important",
                            "pixel_perfect": True,
                        }])
                    }
                }

                p.init_images = [processing_items.canvas] 
                p.image_mask = mask
                p.width = processing_items.canvas_info.width
                p.height = processing_items.canvas_info.height
                p.prompt = img_item.prompt
                p.negative_prompt = img_item.neg_prompt
                p.steps = 20
                p.denoising_strength = img_item.denoising_strength
                p.inpainting_fill = 1
                # p.inpaint_full_res = False
                extendreq = img2imgreq.copy(update={
                    "width": p.width,
                    "height": p.height,
                    "prompt": p.prompt,
                    "negative_prompt": p.negative_prompt,
                    "steps": p.steps,
                    "denoising_strength": p.denoising_strength,
                    "alwayson_scripts": alwayson_scripts
                })



                script_args = self.init_script_args(extendreq, self.default_script_arg_img2img, selectable_scripts, selectable_script_idx, script_runner)

                p.script_args = tuple(script_args) # Need to pass args as tuple here
                processed = process_images(p)
                processing_items.canvas = processed.images[0]
                processed_items.images.append(hijack_api_models.MagicImgResponse(images=[encode_pil_to_base64(processing_items.canvas)], parameters=vars(img2imgreq), info=processed.js(), messeage="完成局部重绘"))

            elif img_item.image_type == "brush_group" and img_item.mask_type == "mask":
                mask = Image.new('RGBA', (processing_items.canvas_info.width, processing_items.canvas_info.height), (0, 0, 0, 0))
                mask.paste(img_item.image, (img_item.rel_left, img_item.rel_top))
                mask_array  = np.array(mask)
                # 设置符合条件的像素点的颜色
                non_transparent_pixels = mask_array[:, :, 3] != 0
                transparent_pixels = mask_array[:, :, 3] == 0
                # 全部反转
                mask_array[non_transparent_pixels] = [255, 255, 255, 255]
                mask_array[transparent_pixels] = [0, 0, 0, 255]
                mask = Image.fromarray(mask_array)

                # 临时底图
                img_full = Image.new('RGBA', (processing_items.canvas_info.width, processing_items.canvas_info.height), (255, 255, 255, 0))
                img_full.paste(img_item.image, (img_item.rel_left, img_item.rel_top))
                mask_canvas = Image.alpha_composite(processing_items.canvas, img_full) 

                alwayson_scripts = {
                    "ControlNet":{
                        "args": ([{
                            "module": "inpaint_only", # 注意调整
                            "model": "control_v11p_sd15_inpaint [ebff9138]", # 注意调整
                            "weight": 1.0,
                            "image": {
                                "image": np.asarray(mask_canvas).astype(np.uint8),
                                "mask":  np.asarray(mask).astype(np.uint8), 
                            },
                            "resize_mode": 2,
                            "lowvram": False,
                            "processor_res": -1,
                            "threshold_a": -1,
                            "threshold_b": -1,
                            "guidance_start": 0.0,
                            "guidance_end": 1.0,
                            "control_mode": "ControlNet is more important",
                            "pixel_perfect": True,
                        }])
                    }
                }

                p.init_images = [mask_canvas] 
                p.image_mask = mask
                p.width = processing_items.canvas_info.width
                p.height = processing_items.canvas_info.height
                p.prompt = img_item.prompt
                p.negative_prompt = img_item.neg_prompt
                p.steps = 20
                p.denoising_strength = img_item.denoising_strength
                p.inpainting_fill = 1
                # p.inpaint_full_res = False
                extendreq = img2imgreq.copy(update={
                    "width": p.width,
                    "height": p.height,
                    "prompt": p.prompt,
                    "negative_prompt": p.negative_prompt,
                    "steps": p.steps,
                    "denoising_strength": p.denoising_strength,
                    "alwayson_scripts": alwayson_scripts
                })



                script_args = self.init_script_args(extendreq, self.default_script_arg_img2img, selectable_scripts, selectable_script_idx, script_runner)

                p.script_args = tuple(script_args) # Need to pass args as tuple here
                processed = process_images(p)
                processing_items.canvas = processed.images[0]
                processed_items.images.append(hijack_api_models.MagicImgResponse(images=[encode_pil_to_base64(mask_canvas)], parameters=vars(img2imgreq), info=processed.js(), messeage="完成局部重绘"))
                processed_items.images.append(hijack_api_models.MagicImgResponse(images=[encode_pil_to_base64(processing_items.canvas)], parameters=vars(img2imgreq), info=processed.js(), messeage="完成局部重绘"))
            # 开启涂鸦模型
            elif img_item.image_type == "brush_group" and img_item.mask_type == "scrawl":
                scrawl_canvas = Image.new('RGBA', (processing_items.canvas_info.width, processing_items.canvas_info.height), (0, 0, 0, 0))
                scrawl_canvas.paste(img_item.image, (img_item.rel_left, img_item.rel_top))

                alwayson_scripts = {
                    "ControlNet":{
                        "args": ([{
                            "module": "tile_resample", # 注意调整
                            "model": "control_v11f1e_sd15_tile [a371b31b]", # 注意调整
                            "weight": 1.0,
                            "image": {
                                "image": np.asarray(scrawl_canvas).astype(np.uint8),
                                "mask":  np.asarray(Image.new('RGBA', (processing_items.canvas_info.width, processing_items.canvas_info.height), (0, 0, 0, 255))).astype(np.uint8), 
                            },
                            "resize_mode": 2,
                            "lowvram": False,
                            "processor_res": -1,
                            "threshold_a": -1,
                            "threshold_b": -1,
                            "guidance_start": 0.0,
                            "guidance_end": 1.0,
                            "control_mode": "ControlNet is more important",
                            "pixel_perfect": True,
                        }])
                    }
                }

                p.init_images = [scrawl_canvas] 
                p.width = processing_items.canvas_info.width
                p.height = processing_items.canvas_info.height
                p.prompt = img_item.prompt
                p.negative_prompt = img_item.neg_prompt
                p.steps = 20
                p.denoising_strength = img_item.denoising_strength
                extendreq = img2imgreq.copy(update={
                    "width": p.width,
                    "height": p.height,
                    "prompt": p.prompt,
                    "negative_prompt": p.negative_prompt,
                    "steps": p.steps,
                    "denoising_strength": p.denoising_strength,
                    "alwayson_scripts": alwayson_scripts
                })

                script_args = self.init_script_args(extendreq, self.default_script_arg_img2img, selectable_scripts, selectable_script_idx, script_runner)

                p.script_args = tuple(script_args) # Need to pass args as tuple here
                processed = process_images(p)
                processed_items.images.append(hijack_api_models.MagicImgResponse(images=list(map(encode_pil_to_base64, processed.images)), parameters=vars(img2imgreq), info=processed.js(), messeage="完成草图生成"))

    def magic2img_pipeline(self, p, magicimgreq: hijack_api_models.MagicImgRequest, img2imgreq:models.StableDiffusionImg2ImgProcessingAPI, selectable_scripts, selectable_script_idx, script_runner):
        # mem_info = self.get_memory()
        # print("剩余", mem_info.cuda["system"]["free"]/1024/1024/1024, "GB")
        canvas_width = magicimgreq.canvas_info.width
        canvas_height = magicimgreq.canvas_info.height
        canvas_top = magicimgreq.canvas_info.top
        canvas_left = magicimgreq.canvas_info.left
        canvas_right = canvas_left+canvas_width
        canvas_bottom = canvas_top+canvas_height

        canvas = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 255))
        combine_layers: List[hijack_api_models.ProcessedImageItem] = []
        processed_images = []

        # ######### 第一阶段裁剪图片，把在canvas外面的image进行裁剪 ######### #
        for img_item in magicimgreq.imgs:
            if img_item.image_type == "image" or img_item.image_type == "brush_group":
                img = decode_base64_to_image(img_item.src)
                new_img_info = crop_image_v2(img, img_item, magicimgreq.canvas_info)
                if new_img_info != False:
                    combine_layers.append(new_img_info)

        # ######### 判断是否有img底图
        if not any(obj.image_type == 'image' for obj in combine_layers):
            return []

        # ######### 第二阶段图生图，看是否有需要单独图生图的image ######### #
        for index, img_item in enumerate(combine_layers):
            if img_item.image_type == "image" and img_item.denoising_strength > 0:
                if img_item.width < 5 or img_item.height < 5:
                    pass
                else:
                    p.init_images = [img_item.image]
                    p.width = img_item.width
                    p.height = img_item.height
                    p.prompt = img_item.prompt
                    p.negative_prompt = img_item.neg_prompt
                    p.steps = 20
                    p.denoising_strength = img_item.denoising_strength
    
                    extendreq = img2imgreq.copy(update={
                        "width": p.width,
                        "height": p.height,
                        "prompt": p.prompt,
                        "negative_prompt": p.negative_prompt,
                        "steps": p.steps,
                        "denoising_strength": p.denoising_strength,
                        "alwayson_scripts": None
                    })

                    script_args = self.init_script_args(extendreq, self.default_script_arg_img2img, selectable_scripts, selectable_script_idx, script_runner)
                    
                    p.script_args = tuple(script_args) # Need to pass args as tuple here
                    processed = process_images(p)
                    processed_img_item = img_item.copy(update={
                        "image": processed.images[0]
                    })
                    combine_layers[index] = processed_img_item

        expand_mask = Image.new('RGBA', (canvas_width, canvas_height), (255, 255, 255, 0))
        crop_coor = [None, None, None, None]
        for img_item in combine_layers:
            if img_item.image_type == "image":
                # 如果新的intersect_left小于旧的则更新
                if crop_coor[0] is None or crop_coor[0] > img_item.left:
                    crop_coor[0] = img_item.left

                if crop_coor[1] is None or crop_coor[1] > img_item.top:
                    crop_coor[1] = img_item.top

                if crop_coor[2] is None or crop_coor[2] < img_item.left+img_item.width:
                    crop_coor[2] = img_item.left+img_item.width

                if crop_coor[3] is None or crop_coor[3] < img_item.top+img_item.height:
                    crop_coor[3] = img_item.top+img_item.height

                img_full = Image.new('RGBA', (canvas_width, canvas_height), (255, 255, 255, 0))
                img_full.paste(img_item.image, (img_item.rel_left, img_item.rel_top))
                expand_mask = Image.alpha_composite(expand_mask, img_full) 
                canvas =  Image.alpha_composite(canvas, img_full) 

            elif img_item.image_type == "brush_group":
                img_full = Image.new('RGBA', (canvas_width, canvas_height), (255, 255, 255, 0))
                img_full.paste(img_item.image, (img_item.rel_left, img_item.rel_top))
        
        crop_coor[0] = crop_coor[0]-canvas_left
        crop_coor[1] = crop_coor[1]-canvas_top
        crop_coor[2] = crop_coor[2]-canvas_left
        crop_coor[3] = crop_coor[3]-canvas_top

        crop_canvas = canvas.crop(crop_coor)
        # ######### 第三阶段扩图 ######### #
        # 如果坐标有变化，说明需要扩图
        if crop_canvas.width < canvas.width or crop_canvas.height < canvas.height:
            expand_mask_np = np.array(expand_mask)
            # 将mask非透明区域设置为透明的，透明区域变成白色
            color_pos = expand_mask_np[:,:,3] != 0
            trans_pos = expand_mask_np[:,:,3] == 0
            expand_mask_np[color_pos] = [0,0,0,0]
            expand_mask_np[trans_pos] = [255,255,255,255]
            expand_mask = Image.fromarray(expand_mask_np)

            # 将canvas透明区域填充为白色
            
            alwayson_scripts = {
                "ControlNet":{
                    "args": ([{
                        "module": "inpaint_only+lama", # 注意调整
                        "model": "control_v11p_sd15_inpaint [ebff9138]", # 注意调整
                        "weight": 1.0,
                        "image": {
                            "image": np.asarray(canvas).astype(np.uint8),
                            "mask": np.asarray(expand_mask).astype(np.uint8),
                        },
                        "resize_mode": 2,
                        "lowvram": False,
                        "processor_res": -1,
                        "threshold_a": -1,
                        "threshold_b": -1,
                        "guidance_start": 0.0,
                        "guidance_end": 1.0,
                        "control_mode": "ControlNet is more important",
                        "pixel_perfect": True,
                    }])
                }
            }

            p.init_images = [crop_canvas]
            p.width = canvas_width
            p.height = canvas_height
            p.prompt = ""
            p.negative_prompt = ""
            p.steps = 20
            p.denoising_strength = 0.75

            extendreq = img2imgreq.copy(update={
                "width": p.width,
                "height": p.height,
                "prompt": p.prompt,
                "negative_prompt": p.negative_prompt,
                "steps": p.steps,
                "denoising_strength": p.denoising_strength,
                "alwayson_scripts": alwayson_scripts
            })

            script_args = self.init_script_args(extendreq, self.default_script_arg_img2img, selectable_scripts, selectable_script_idx, script_runner)
            
            p.script_args = tuple(script_args) # Need to pass args as tuple here
            processed = process_images(p)
            canvas = processed.images[0]
            _before_expand_canvas = processed.images[1] # 带上mask信息的图片
            # expand后尺寸可能有几个像素级别的改变，需要缩放到一致
            if canvas.width != canvas_width or canvas.height != canvas_height:
                canvas_width = canvas.width
                canvas_height = canvas.height
                canvas_right = canvas_left+canvas_width
                canvas_bottom = canvas_top+canvas_height

            processed_images += [encode_pil_to_base64(crop_canvas), encode_pil_to_base64(canvas)]
        else:
            processed_images += [encode_pil_to_base64(canvas)]


        # ######### 第四阶段修复 对于mask区域进行图生图修复 ######### #
        # 遍历获得mask的位置,对每个mask执行一次cldm+inpaint
        for img_item in combine_layers:
            if img_item.image_type == "brush_group":
                # 问题在这里，canvas_width尺寸已经变化
                mask = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))
                mask.paste(img_item.image, (img_item.rel_left, img_item.rel_top))
                mask_array  = np.array(mask)
                # 设置符合条件的像素点的颜色
                non_transparent_pixels = mask_array[:, :, 3] != 0
                transparent_pixels = mask_array[:, :, 3] == 0
                # 全部反转
                mask_array[non_transparent_pixels] = [255, 255, 255, 255]
                mask_array[transparent_pixels] = [0, 0, 0, 255]
                mask = Image.fromarray(mask_array)
                alwayson_scripts = {
                    "ControlNet":{
                        "args": ([{
                            "module": "inpaint_only", # 注意调整
                            "model": "control_v11p_sd15_inpaint [ebff9138]", # 注意调整
                            "weight": 1.0,
                            "image": {
                                "image": np.asarray(canvas).astype(np.uint8),
                                "mask":  np.asarray(mask).astype(np.uint8), 
                            },
                            "resize_mode": 2,
                            "lowvram": False,
                            "processor_res": -1,
                            "threshold_a": -1,
                            "threshold_b": -1,
                            "guidance_start": 0.0,
                            "guidance_end": 1.0,
                            "control_mode": "ControlNet is more important",
                            "pixel_perfect": True,
                        }])
                    }
                }

                p.init_images = [canvas] 
                p.image_mask = mask
                p.width = canvas_width
                p.height = canvas_height
                p.prompt = img_item.prompt
                p.negative_prompt = img_item.neg_prompt
                p.steps = 20
                p.denoising_strength = img_item.denoising_strength
                p.inpainting_fill = 1
                # p.inpaint_full_res = False
                extendreq = img2imgreq.copy(update={
                    "width": p.width,
                    "height": p.height,
                    "prompt": p.prompt,
                    "negative_prompt": p.negative_prompt,
                    "steps": p.steps,
                    "denoising_strength": p.denoising_strength,
                    "alwayson_scripts": alwayson_scripts
                })



                script_args = self.init_script_args(extendreq, self.default_script_arg_img2img, selectable_scripts, selectable_script_idx, script_runner)

                p.script_args = tuple(script_args) # Need to pass args as tuple here
                processed = process_images(p)
                # encode_pil_to_base64(mask) # mask信息
                processed_images += [encode_pil_to_base64(processed.images[0])]
                canvas = processed.images[0]


        return processed_images


    def setSdModel(self, setmodelreq: hijack_api_models.SetModelRequest):
        self.set_config({'sd_model_checkpoint': setmodelreq.model_name})
        self.refresh_checkpoints()
        config = self.get_config()

        return hijack_api_models.SetModelResponse(model_name=config["sd_model_checkpoint"], model_hash=config["sd_checkpoint_hash"], status="on")


    def get_selected_model(self):
        config = self.get_config()
        return hijack_api_models.GetSelectedModelResponse(model_name=config["sd_model_checkpoint"], model_hash=config["sd_checkpoint_hash"], status=True) 

def is_rectangles_intersect(x1, y1, x2, y2, x3, y3, x4, y4):
    """判断两个box是否相交
    """
    if x2 < x3 or x1 > x4 or y2 < y3 or y1 > y4:
        return False
    else:
        return True

def crop_image_v2(img, img_info:hijack_api_models.MagicImgItem, canvas_info:hijack_api_models.CanvasInfoItem):
    """根据传入的图片，图片信息和画布信息，对图片进行裁剪，并返回图片裁剪后的位置
    """
    canvas_left = canvas_info.left
    canvas_top = canvas_info.top
    canvas_right = canvas_info.left+canvas_info.width
    canvas_bottom = canvas_info.top+canvas_info.height
    left = img_info.left
    top = img_info.top
    right = left + img.width
    bottom = top + img.height
    if not is_rectangles_intersect(canvas_left, canvas_top, canvas_right, canvas_bottom, left, top, right, bottom):
        return False

    # 计算交叉区域的坐标
    intersect_top = max(top, canvas_top)
    intersect_left = max(left, canvas_left)
    intersect_right = min(right, canvas_right)
    intersect_bottom = min(bottom, canvas_bottom)

    # 裁剪不相交的区域
    img = img.crop((intersect_left - left, intersect_top - top, intersect_right - left, intersect_bottom - top))
    # 返回相交区域的left和top
    new_img_info = hijack_api_models.ProcessedImageItem(
        image=img, 
        image_type=img_info.image_type, 
        height=img.height,
        width=img.width,
        top=intersect_top,
        left=intersect_left,
        rel_top=intersect_top-canvas_top,
        rel_left=intersect_left-canvas_left,
        prompt=img_info.prompt,
        neg_prompt=img_info.neg_prompt,
        denoising_strength = img_info.denoising_strength,
        mask_type=img_info.mask_type
    )
    return new_img_info

def crop_image_v3(img, img_info:hijack_api_models.MagicImgItemV2, canvas_info:hijack_api_models.CanvasInfoItemV2):
    """根据传入的图片，图片信息和画布信息，对图片进行裁剪，并返回图片裁剪后的位置
    """
    canvas_left = canvas_info.left
    canvas_top = canvas_info.top
    canvas_right = canvas_info.left+canvas_info.width
    canvas_bottom = canvas_info.top+canvas_info.height
    left = img_info.left
    top = img_info.top
    right = left + img.width
    bottom = top + img.height
    if not is_rectangles_intersect(canvas_left, canvas_top, canvas_right, canvas_bottom, left, top, right, bottom):
        return False

    # 计算交叉区域的坐标
    intersect_top = max(top, canvas_top)
    intersect_left = max(left, canvas_left)
    intersect_right = min(right, canvas_right)
    intersect_bottom = min(bottom, canvas_bottom)

    # 裁剪不相交的区域
    img = img.crop((intersect_left - left, intersect_top - top, intersect_right - left, intersect_bottom - top))
    
    # 缩放成8的倍数
    img = resize_to_nearest_multiple_of_8(img)
    
    # 返回相交区域的left和top
    new_img_info = hijack_api_models.ProcessedImageItemV2(
        image=img, 
        image_type=img_info.image_type, 
        height=img.height,
        width=img.width,
        top=intersect_top,
        left=intersect_left,
        rel_top=intersect_top-canvas_top,
        rel_left=intersect_left-canvas_left,
    )
    return new_img_info

def resize_to_nearest_multiple_of_8(image):
    # 计算新的宽度和高度
    new_width = (image.width // 8) * 8
    new_height = (image.height // 8) * 8

    # 缩放图片
    resized_image = image.resize((new_width, new_height))

    return resized_image

def undo_controlnet_hijack(p):
    # 在Controlnet使用后，condition阶段的模型结果被controlnet调整了，只适用于cldm的注意力，因此需要对部分还原
    from ldm.modules.attention import BasicTransformerBlock
    from modules.processing import StableDiffusionProcessing
    # 这个地方问题最大 uc和c被缓存了，但是controlnet修改了这个结果，只能用于cldm，所以原生模型再用出错
    StableDiffusionProcessing.cached_uc = [None, None]
    StableDiffusionProcessing.cached_c = [None, None]

    # 下面是模型被劫持的部分，cldm原生的undo没有还原完，这里进行完整的还原
    def torch_dfs(model: torch.nn.Module):
        result = [model]
        for child in model.children():
            result += torch_dfs(child)
        return result
    
    model = p.sd_model.model.diffusion_model
    all_modules = torch_dfs(model)

    attn_modules = [module for module in all_modules if isinstance(module, BasicTransformerBlock)]
    attn_modules = sorted(attn_modules, key=lambda x: - x.norm1.normalized_shape[0])

    for i, module in enumerate(attn_modules):
        if getattr(module, '_original_inner_forward', None) is None:
            pass
        else:
            module._forward = module._original_inner_forward
            module._original_inner_forward = None


    gn_modules = [model.middle_block]

    input_block_indices = [4, 5, 7, 8, 10, 11]
    for w, i in enumerate(input_block_indices):
        module = model.input_blocks[i]
        gn_modules.append(module)

    output_block_indices = [0, 1, 2, 3, 4, 5, 6, 7]
    for w, i in enumerate(output_block_indices):
        module = model.output_blocks[i]
        gn_modules.append(module)

    for i, module in enumerate(gn_modules):
        if getattr(module, 'original_forward', None) is None:
            pass
        else:
            module.forward = module.original_forward
            module.original_forward = None