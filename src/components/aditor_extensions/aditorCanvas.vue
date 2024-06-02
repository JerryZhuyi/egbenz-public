<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, PropType, defineOptions,nextTick } from 'vue';
import { AditorDocView, ANodeType, AditorNode, dispatchUpdateData} from 'vue-aditor'
import {
    PlayCircle24Filled as RunIcon,
    Cursor20Filled as CursorIcon,
    ArrowMove24Filled as MoveIcon,
    PaintBrush24Filled as BrushIcon,

    AutoFitWidth20Filled as AutoFitWidthIcon,
    Lasso20Filled as LassoIcon,
    PaintBrush16Filled as PaintBrushIcon,
    ImageArrowCounterclockwise24Filled as Img2ImgIcon,
    ImageEdit24Filled as TransBrushIcon,

    ArrowCircleUp24Filled as ArrowUpIcon,
    ArrowCircleDown24Filled as ArrowDownIcon,
    PresenceOffline10Regular as CloseIcon,

    Add24Filled as AddIcon,

} from '@vicons/fluent'

import { fabric } from 'fabric'
import { initCanvas, CanvasState, CanvasToolEnum, AIFunctionEnum, brushLayerTypes, LayerTypeEnum } from './aditorCanvasUtils'
import { request } from '../../api/index.ts';
import { events } from '../../bus.ts';


defineOptions({
    name: 'aditorCanvas',
    config: {
        secondaryType: ANodeType.BlockLeaf,
        dataKeyName: 'content',
    },
    inheritAttrs: true,
})

const canvasContainerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasBodyRef = ref<HTMLDivElement | null>(null)

const activeNames = ref(['1'])

const props = defineProps({
    aNode: {
        type: Object as PropType<AditorNode>,
        required: true,
    },
    docView: {
        type: Object as PropType<AditorDocView>,
        required: true,
    }
})

const saveCallback = (data:{canvas: string, state: string})=>{
    dispatchUpdateData(props.docView, props.aNode.start, data)
}
const undoCallback = ()=>{
    props.docView.undo()
}
const redoCallback = ()=>{
    props.docView.redo()
}

const canvasState = new CanvasState(saveCallback, undoCallback, redoCallback)

const updateAfterUndoRedo = (_s:any, _ns:any, updateHookInfo:any) => {
    if(updateHookInfo?.name === 'undo' ){
        nextTick(()=>canvasState.undo(props.aNode.data as {canvas: any, state: any}))
    }else if(updateHookInfo?.name === 'redo'){
        nextTick(()=>canvasState.redo(props.aNode.data as {canvas: any, state: any}))
    }
}


//********************* 远程请求绘画 ***************************//
const isServerDrawing = ref(false)

const startPolling = async () => {
    return await request.sdProgress().then(response => {
        if (response.status == 200) {
            let progress = response.data.progress? response.data.progress: 0
            return {
                status: true,
                progress: Math.min(Math.ceil(progress * 100), 100),
                msg: response.data.msg
            }
        }else{
            return {
                status: false,
                progress: 0,
                msg: response.data.msg
            }
        }
    }).catch(error => {
        return {
            status: false,
            progress: 0,
            msg: error
        }
    });
}

const handleRunModel = async () => {
    // TODO: 这里点击过快会停止其他，如AICHAT的SD绘画过程；需要分离，后面再说吧
    if (isServerDrawing.value) {
        request.sd2Interrupt({})
        return
    }

    isServerDrawing.value = true
    events.emit('show-progress')
    events.emit('start-server-polling', {callback:startPolling, interval: 100})

    try{
        const func = makeRunModelParams()
        await request.aiDraw(func).then((response)=> {
            try {
                if (response.status == 200) {
                    if (response.data.images?.length >= 1) {
                        const images = []
                        for (let inner_images of response.data.images) {
                            let type = inner_images?.type || 'data:image/png;base64,'
                            for(let _src of inner_images.images){
                                let src = _src
                                if (type === 'data:image/png;base64,') {
                                    src = type + src
                                }
                                images.push({src})
                            }
                        }
                        // 判断是否存在outputs,如果存在则把旧的outputs和images合并，并且把新合并的outputs赋值给outputs
                        if (props.aNode.data.outputs) {
                            dispatchUpdateData(props.docView, props.aNode.start, Object.assign(props.aNode.data, {outputs: props.aNode.data.outputs.concat(images)}))
                            // props.aNode.data.outputs = props.aNode.data.outputs.concat(images)
                        } else {
                            dispatchUpdateData(props.docView, props.aNode.start, Object.assign(props.aNode.data, {outputs: images}))
                            // props.aNode.data.outputs = images
                        }
                    }else{
                        console.warn(response.data.messeage)
                    }
                }else{
                }
            } catch (e) {
                console.warn(e)
            }
            return true
        }).catch(e => {
            console.warn(e)
            return false
        })
    }catch(e){

    }

    isServerDrawing.value = false
    events.emit('hide-progress')
    events.emit('stop-server-polling')

}

const makeRunModelParams = ()=>{
    // 根据当前选中图层类型调整
    const objects = []
    const canvas_info = {
        width: 800,
        height: 600,
        left: 0,
        top: 0,
        draw_type: LayerTypeEnum.img2img,
        denoising_strength: (canvasState.aiStrengthComputed.value / 100).toFixed(2),
        // 这里进行索引
        prompt: canvasState.rawState.postivePrompt,
        neg_prompt: canvasState.rawState.negativePrompt,
        n_iter: canvasState.rawState.n_iter,
        steps: canvasState.rawState.steps,
    }

    if ([
        LayerTypeEnum.inpaint,
        LayerTypeEnum.lassoInpaint,
        LayerTypeEnum.img2img,
        LayerTypeEnum.sketch2img].includes(canvasState.selectedLayerType)) {
        // 获取当前绑定图片作为canvas
        // 当前选中层作为image
        const selected_layer = canvasState.selectedLayer
        if(selected_layer == undefined){
            return
        }
        const image_layer = canvasState.findLayerByID(selected_layer.aditorData.bind_image_id)
        if(image_layer == undefined){
            return
        }
        if (image_layer) {
            const _width = image_layer.width ? image_layer.width : 0
            const _height = image_layer.height ? image_layer.height : 0
            const _scaleX = image_layer.scaleX ? image_layer.scaleX : 1
            const _scaleY = image_layer.scaleY ? image_layer.scaleY : 1
            const _left = image_layer.left ? image_layer.left : 0
            const _top = image_layer.top ? image_layer.top : 0

            canvas_info.width = _width * _scaleX
            canvas_info.height = _height * _scaleY
            canvas_info.left = _left
            canvas_info.top = _top
            canvas_info.draw_type = selected_layer.aditorData.type
            objects.push({
                src: image_layer.toDataURL({ format: 'png', multiplier: 1 })
                , image_type: image_layer.aditorData.type
                , top: _top
                , left: _left
                , height: Math.ceil(_height * _scaleY)
                , width: Math.ceil(_width * _scaleX)
            })

            objects.push({
                src: selected_layer.toDataURL({ format: 'png', multiplier: 1 })
                , image_type: selected_layer.aditorData.type
                , top: selected_layer.top
                , left: selected_layer.left
                , height: Math.ceil((selected_layer.height || 0) * (selected_layer.scaleY || 1))
                , width: Math.ceil((selected_layer.width || 0) * (selected_layer.scaleX || 1))
            })
        } else {
            isServerDrawing.value = false
            return false
        }
    } else if (LayerTypeEnum.handdraw === canvasState.selectedLayerType) {
        // 当前选中层作为canvas
        const selected_layer = canvasState.selectedLayer
        if (selected_layer) {
            canvas_info.width = (selected_layer.width || 0) * (selected_layer.scaleX || 1)
            canvas_info.height = (selected_layer.height || 0) * (selected_layer.scaleY || 1)
            canvas_info.left = selected_layer.left || 0
            canvas_info.top = selected_layer.top || 0
            canvas_info.draw_type = selected_layer.aditorData.type
            objects.push({
                src: selected_layer.toDataURL({ format: 'png', multiplier: 1 })
                , image_type: selected_layer.aditorData.type
                , top: selected_layer.top
                , left: selected_layer.left
                , height: Math.ceil((selected_layer.height || 0) * (selected_layer.scaleY || 1))
                , width: Math.ceil((selected_layer.width || 0) * (selected_layer.scaleX || 1))
            })
        } else {
            isServerDrawing.value = false
            return false
        }
    } else if (LayerTypeEnum.expandRect === canvasState.selectedLayerType) {
        // 获取当前绑定图片作为canvas
        // 当前选中层作为image
        const selected_layer = canvasState.selectedLayer
        if(selected_layer == undefined){
            return
        }
        const image_layer = canvasState.findLayerByID(selected_layer.aditorData.bind_image_id)
        if (image_layer && selected_layer) {
            canvas_info.width = (selected_layer.width || 0) * (selected_layer.scaleX || 1)
            canvas_info.height = (selected_layer.height || 0) * (selected_layer.scaleY || 1)
            canvas_info.left = selected_layer.left || 0
            canvas_info.top = selected_layer.top || 0
            canvas_info.draw_type = selected_layer.aditorData.type
            objects.push({
                src: image_layer.toDataURL({ format: 'png', multiplier: 1 })
                , image_type: image_layer.aditorData.type
                , top: image_layer.top
                , left: image_layer.left
                , height: Math.ceil((image_layer.height || 0) * (image_layer.scaleY || 1))
                , width: Math.ceil((image_layer.width || 0) * (image_layer.scaleX || 1))
            })
            objects.push({
                src: selected_layer.toDataURL({ format: 'png', multiplier: 1 })
                , image_type: selected_layer.aditorData.type
                , top: selected_layer.top
                , left: selected_layer.left
                , height: Math.ceil((selected_layer.height || 0) * (selected_layer.scaleY || 1))
                , width: Math.ceil((selected_layer.width || 0) * (selected_layer.scaleX || 1))
            })
        } else {
            isServerDrawing.value = false
            return false
        }
    } else {
        isServerDrawing.value = false
        return false
    }

    const func = {
        fname: "magic_draw",
        imgs: objects,
        canvas_info
    }

    return func

}

const resizeCanvasOuter = ()=>{
    const width = canvasState.resizeCanvas()
    // 设置 canvasBodyRef 宽度
    canvasBodyRef.value!.style.width = width+480 + 'px'
}

onMounted(() => {
    const canvas = initCanvas(canvasRef.value as HTMLCanvasElement)
    canvasState.bindCanvas(canvas as fabric.Canvas)
    window.addEventListener('resize', resizeCanvasOuter)
    canvasState.loadCanvasFromJSON(props.aNode.data)
    props.docView.bindViewEventHook('afterUpdateState', updateAfterUndoRedo)
    resizeCanvasOuter()
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', resizeCanvasOuter)
    props.docView.unbindViewEventHook('afterUpdateState', updateAfterUndoRedo)
})

</script>

<template>
    <div class="aditor-block-outer" ref="canvasBodyRef" contenteditable="false" aditor-ignore-event>
        <div class="aditor-inner-box">
            <div class="el-col">
                <div class="el-col-tool-outer">
                    <div class="tool-title">AI画布</div>
                    <div class="tool-body-canvas">
                        <div class="canvas-container" ref="canvasContainerRef" tabindex="0"
                            @keydown="canvasState.handleKeydown"
                        >
                            <canvas ref="canvasRef"></canvas>
                        </div>
                    </div>
                </div>
            </div>
            <div class="el-col">
                <div class="el-col-tool-outer">
                    <div class="tool-title">工具</div>
                    <div class="tool-body">
                        <div class="tool-box">
                            <div>正向提示</div>
                            <el-input size="small" ref="layerPromptRef" v-model="canvasState.postivePromptComputed.value">
                            </el-input>
                        </div>  
                        <div class="tool-box">
                            <div>负向提示</div>
                            <el-input size="small" ref="layerPromptRef" v-model="canvasState.negativePromptComputed.value">
                            </el-input>
                        </div>
                        <div class="tool-box">
                            <div>AI强度</div>
                            <el-slider size="small" v-model="canvasState.aiStrengthComputed.value" />
                        </div>
                    
                        <div class="tool-box">
                            <div>张数</div>
                            <el-input-number size="small" v-model="canvasState.nIterComputed.value" :min="1" :max="50"/>
                        </div>
                        <div style="width:100%">
                            <el-button style="width:100%;" size="small" type="default" @click="handleRunModel" :disabled="canvasState.funcName == ''">
                                <template #icon>
                                    <RunIcon />
                                </template>{{ isServerDrawing ? '停止':'运行' }}{{ canvasState.funcName }}
                            </el-button>
                        </div>

                        <el-divider />

                        <!-- 基本工具 -->
                        <div>
                            <el-radio-group v-model="canvasState.selectedToolComputed.value" size="small">
                                <el-radio-button :label="CanvasToolEnum.select" :value="CanvasToolEnum.select">
                                    选择<el-icon class="el-icon--right">
                                        <CursorIcon />
                                    </el-icon>
                                </el-radio-button>
                                <el-radio-button :label="CanvasToolEnum.move" :value="CanvasToolEnum.move">
                                    移动<el-icon class="el-icon--right">
                                        <MoveIcon />
                                    </el-icon>
                                </el-radio-button>
                                <el-radio-button :label="CanvasToolEnum.brush" :value="CanvasToolEnum.brush" :disabled="!brushLayerTypes.includes(canvasState.selectedLayerType)">
                                    画笔<el-icon class="el-icon--right">
                                        <BrushIcon />
                                    </el-icon>
                                </el-radio-button>
                            </el-radio-group>
                        </div>
                        <el-divider />
                        <!-- AI扩展工具 -->
                        <div>
                            <el-space wrap>
                                <el-button size="small" @click.stop="canvasState.aiFuncEvent(AIFunctionEnum.expand)" :disabled="LayerTypeEnum.image !== canvasState.selectedLayerType">
                                    扩图<el-icon class="el-icon--right">
                                        <AutoFitWidthIcon />
                                    </el-icon>
                                </el-button>
                                <el-button size="small" @click.stop="canvasState.selectedToolComputed.value = CanvasToolEnum.lasso" :disabled="LayerTypeEnum.image !== canvasState.selectedLayerType">
                                    圈选重绘<el-icon class="el-icon--right">
                                        <LassoIcon />
                                    </el-icon>
                                </el-button>
                                <el-button size="small" @click.stop="canvasState.aiFuncEvent(AIFunctionEnum.inpaint)" :disabled="LayerTypeEnum.image !== canvasState.selectedLayerType">
                                    涂抹重绘<el-icon class="el-icon--right">
                                        <PaintBrushIcon />
                                    </el-icon>
                                </el-button>
                                <el-button size="small" @click.stop="canvasState.aiFuncEvent(AIFunctionEnum.img2img)" :disabled="LayerTypeEnum.image !== canvasState.selectedLayerType">
                                    图生图<el-icon class="el-icon--right">
                                        <Img2ImgIcon />
                                    </el-icon>
                                </el-button>
                                <el-button size="small" @click.stop="canvasState.aiFuncEvent(AIFunctionEnum.img2sketch)" :disabled="LayerTypeEnum.image !== canvasState.selectedLayerType">
                                    草图生图<el-icon class="el-icon--right">
                                        <TransBrushIcon />
                                    </el-icon>
                                </el-button>
                            </el-space>
                        </div>
                        <el-divider />
                        <!-- 画笔工具 -->
                        <div>
                            <div class="demo-color-block">
                                <span class="demonstration">画笔颜色</span>
                                <el-color-picker v-on:active-change="(val:string|null)=>canvasState.brushColorComputed.value=(val||'#000000')" v-model="canvasState.brushColorComputed.value" />
                            </div>
                            <div class="slider-demo-block">
                                <span class="demonstration">画笔粗细</span>
                                <el-slider v-model="canvasState.brushSizeComputed.value" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="el-col">
                <div class="el-col-tool-outer">
                    <div class="tool-title">
                        <span>图层</span>
                        <el-button size="small" @click.stop="canvasState.aiFuncEvent(AIFunctionEnum.handdraw)">
                            <el-icon>
                                <AddIcon />
                            </el-icon>新建图层
                        </el-button>
                    </div>
                    <div class="tool-body tool-layer-body">
                        
                        <div class="tool-layer-outer" 
                            @click.stop = "canvasState.toggleLayer(item.aditorData.id)"
                            v-for="(item, _i) in canvasState.allShowLayersComputed.value"
                            :class="[canvasState.isSelectedLayer(item) ? 'layer-selected' : null]"
                        >
                            <div style="display:flex; justify-content: space-between; align-items: center;">
                                <div>{{ item.aditorData.name }}</div>
                                <div>
                                    <el-button-group size="small">
                                        <el-button type="default" @click.stop="canvasState.handleLayerBackward(item.aditorData.id)">
                                            <template #icon>
                                                <el-icon>
                                                    <ArrowUpIcon />
                                                </el-icon>
                                            </template>
                                        </el-button>
                                        <el-button type="default" @click.stop="canvasState.handleLayerForward(item.aditorData.id)">
                                            <template #icon>
                                                <el-icon>
                                                    <ArrowDownIcon />
                                                </el-icon>
                                            </template>
                                        </el-button>
                                        <el-button type="default" @click.stop="canvasState.handleDeleteLayer(item.aditorData.id)">
                                            <template #icon>
                                                <el-icon>
                                                    <CloseIcon />
                                                </el-icon>
                                            </template>
                                        </el-button>
                                    </el-button-group>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="aditor-outputs" v-show="props.aNode.data.outputs && props.aNode.data.outputs.length > 0">
            <el-collapse v-model="activeNames">
                <el-collapse-item title="画布输出" name="1">
                    <div class="gallery">
                        <div class="image-container" v-for="(image, index) in aNode.data.outputs" :key="index">
                            <img :src="image.src" class="image" />
                        </div>
                    </div>
                </el-collapse-item>
            </el-collapse>
        </div>
    </div>
</template>

<style scoped>
.aditor-block-outer {
    /* margin:5px; */
    position: relative;
    min-height: 660px;
}

.aditor-inner-box {
    border-radius: 4px;
    border: 1px solid rgb(224, 224, 230);
    transition: box-shadow 0.3s ease, border-color 0.3s ease;
    /* width: 100%; */
    max-width: 1440px!important;
    height: 660px;
    display: flex;
    font-size:12px;
}
.aditor-outputs{

}
.gallery {
  display: flex;
  flex-wrap: wrap;
}

.gallery .image-container {
  width: 100px;
  height: 100px;
  margin: 5px;
}

.gallery .image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gallery .image-title {
  text-align: center;
}

.aditor-inner-box .el-col {
    /* width: 100%; */
    height: 100%;
}
.aditor-inner-box .el-col:nth-child(1) {
    border-right: 1px solid var(--e-border-color);
    box-shadow: var(--e-box-shadow-right)
}
.aditor-inner-box .el-col:nth-child(2){
    border-right: 1px solid var(--e-border-color);
    box-shadow: var(--e-box-shadow-right)
}

.aditor-inner-box .el-col:nth-child(2),
.aditor-inner-box .el-col:nth-child(3) {
    width: 240px;
}

.el-col-tool-outer {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.el-col-tool-outer .tool-title {
    font-weight: bold;
    padding:15px 20px; 
    font-size: 16px;
    color: #303133;
    border-bottom: 1px solid #ebeef5;
    display: flex;
    justify-content: space-between;
}

.el-col-tool-outer .tool-body {
    padding:20px; 
    flex:1; 
    overflow:auto
}
.el-col-tool-outer .tool-body-canvas{
    padding:5px; 
    flex:1; 
    overflow:auto
}
.el-col-tool-outer .tool-layer-body{
    padding: 0px;
}
.canvas-container:focus{
    outline: none;
}

.tool-box{
    display: flex;
    align-items: center;
    margin-bottom:10px;
}

/* .tool-box第一个元素固定宽度60px */
.tool-box div:first-child{
    width: 80px;
}
/* .tool-box第二个元素占据剩下宽度 */
.tool-box div:nth-child(2){
    flex: 1;
}

.slider-demo-block {
    max-width: 600px;
    display: flex;
    align-items: center;
}

.slider-demo-block .el-slider {
    margin-top: 0;
    margin-left: 12px;
}

.slider-demo-block .demonstration {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 0;
    margin-right: 8px;
}

.slider-demo-block .demonstration+.el-slider {
    flex: 55% 0 0;
}

.demo-color-block {
    display: flex;
    align-items: center;
    margin-bottom: 16px;
}

.demo-color-block .demonstration {
    margin-right: 12px;
}

.canvastool-block-outer {
    height: 100%;
}

.canvastool-box-inner {
    height: 100%;
    overflow: auto;
}

.tool-layer-outer{
    padding: 10px 10px;
    border-top: 1px solid #ebeef5;
    cursor: pointer;
    transition: background-color 0.3s;
    font-size: 12px;
}
.tool-layer-outer:hover{
    background-color: #f5f7fa;
}

.tool-layer-outer:nth-child(1){
    border-top: none;
}
.layer-selected {
    background-color: rgb(243, 243, 245);
}

</style>
