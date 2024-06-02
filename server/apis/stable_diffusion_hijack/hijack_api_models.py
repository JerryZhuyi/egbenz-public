from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, validator, constr


#############################################
############ V1版本相关的数据模型 #############
#############################################

class EnumImageType(str, Enum):
    image = "image"
    brush = "brush"
    draw_area = "draw_area"
    brush_group = "brush_group"

class MagicImgItem(BaseModel):
    src: str 
    image_type: EnumImageType = Field(default="brush", title="ImageType")
    denoising_strength: float 
    prompt: str 
    neg_prompt: str 
    top: int
    left: int 
    width: int 
    height: int
    mask_type: str = Field(default="origin")

class CanvasInfoItem(BaseModel):
    width: int 
    height: int
    top: int 
    left: int
    prompt: str = Field(default= "")
    neg_prompt: str = Field(default= "")
    denoising_strength: float = Field(default=0.75)
    txt2img: int = Field(default=0)

class MagicImgRequest(BaseModel):
    fname: str
    imgs: List[MagicImgItem]
    canvas_info: CanvasInfoItem

class MagicImgResponse(BaseModel):
    images: List[str] = Field(default=None, title="Image", description="The generated image in base64 format.")
    parameters: dict
    info: str
    messeage: str

class MagicImgsResponse(BaseModel):
    images: List[MagicImgResponse] = Field(default=[])
    messeage: str = Field(default="")

class MagicImgResponseImageType(BaseModel):
    images: List[object] = Field(default=None, title="Image", description="The generated image in base64 format.")
    parameters: dict
    info: str
    messeage: str

class ProcessedImageItem(BaseModel):
    image: object
    image_type: EnumImageType = Field(default="brush", title="ImageType")
    denoising_strength: float 
    prompt: str 
    neg_prompt: str 
    top: int
    left: int 
    rel_top: int = Field(description="相对于canvas的top")
    rel_left: int = Field(description="相对于canvas的left")
    width: int 
    height: int
    mask_type: str = Field(default="origin")


class MagicProcessingItems(BaseModel):
    canvas_info: CanvasInfoItem = Field(default=CanvasInfoItem(width=0,height=0,top=0,left=0,prompt="",neg_prompt="",denoising_strength=0))
    canvas: object = Field(default=None)
    combine_layers: List[ProcessedImageItem] = Field(default=[])
    # 这两个是在recombine完成后expand使用，如果任意是None，不扩图
    expand_mask: object = Field(default=None)
    expand_canvas: object = Field(default=None)



#############################################
############ V2版本相关的数据模型 #############
#############################################
class EnumDrawType(str, Enum):
    expand_rect = "expandRect"
    inpaint = "inpaint"
    lasso_inpaint = "lassoInpaint"
    img2img = "img2img"
    handdraw = "handdraw"
    image = "image"
    sketch2img = "sketch2img"
    txt2img = "txt2img"

class CanvasInfoItemV2(BaseModel):
    width: int 
    height: int
    top: int 
    left: int
    draw_type: EnumDrawType = Field(default=EnumDrawType.img2img)
    denoising_strength: float 
    prompt: str 
    neg_prompt: str 
    n_iter: Optional[int] = Field(default=1)
    steps: Optional[int] = Field(default=20)

class MagicImgItemV2(BaseModel):
    src: str 
    image_type: EnumDrawType = Field(default=EnumDrawType.img2img, title="ImageType")
    top: int
    left: int 
    width: int 
    height: int

class MagicImgRequestV2(BaseModel):
    fname: str
    imgs: List[MagicImgItemV2]
    canvas_info: CanvasInfoItemV2

class ProcessedImageItemV2(BaseModel):
    image: object
    image_type: EnumDrawType = Field(default=EnumDrawType.img2img, title="ImageType")
    top: int
    left: int 
    rel_top: int = Field(description="相对于canvas的top")
    rel_left: int = Field(description="相对于canvas的left")
    width: int 
    height: int
    
class MagicProcessingItemsV2(BaseModel):
    canvas_info: CanvasInfoItemV2 = Field(default=CanvasInfoItemV2(width=0,height=0,top=0,left=0,draw_type=EnumDrawType.img2img, denoising_strength=0.75, prompt="", neg_prompt=""))
    canvas: object = Field(default=None)
    combine_layers: List[ProcessedImageItemV2] = Field(default=[])
    # 这两个是在recombine完成后expand使用，如果任意是None，不扩图
    expand_mask: object = Field(default=None)
    expand_canvas: object = Field(default=None)


class Txt2imgRequest(BaseModel):
    fname: str
    prompt: str = Field(default="")
    negative_prompt: str = Field(default="")
    cfg_scale: float = Field(default=0.75)
    height: int = Field(default=512)
    width: int = Field(default=512)
    n_iter: int = Field(default=1)
    steps: int = Field(default=20)
    seed: int = Field(default=-1)

class Img2imgRequest(BaseModel):
    fname: str
    prompt: str = Field(default="")
    negative_prompt: str = Field(default="")
    cfg_scale: float = Field(default=0.75)
    height: int = Field(default=512)
    width: int = Field(default=512)
    n_iter: int = Field(default=1)
    steps: int = Field(default=20)
    seed: int = Field(default=-1)
    init_image: str = Field(default="")
    denoising_strength: float = Field(default=0.75)

# 设置模型
class SetModelRequest(BaseModel):
    model_name: str

class SetModelResponse(BaseModel):
    model_name: str
    model_hash: str
    status: str

class GetSelectedModelResponse(BaseModel):
    model_name: str
    model_hash: str
    status: bool