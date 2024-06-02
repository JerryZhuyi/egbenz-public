import { fabric } from 'fabric'
import { ComputedRef, WritableComputedRef, Ref, ref, reactive, computed, toRaw } from 'vue';
import { globalState } from '../../global-state.ts';

export interface canvasStateInterface {
    brushSize: number,
    brushColor: string,
    aiStrength: number,

    isDragging: boolean,                              // 是否正在拖拽
    lastPosX: number,                                    // 上一次鼠标X坐标
    lastPosY: number,                                    // 上一次鼠标Y坐标

    selectedLayersIds : number[],                        // 选中的图层ID
    selectedTool: CanvasToolEnum,                   // 选中的工具
    lastOptImageId: number,                              // 上一次操作的图像ID
    
    postivePrompt: string,                              // 正向提示
    negativePrompt: string,                             // 负向提示
    n_iter: number,                                      // 迭代次数
    steps: number,                                      // 步数

    viewPortTransform: number[],                        // 视口转换
}

export enum CanvasToolEnum {
    select = "select",
    move = "move",
    brush = "brush",
    lasso = "lasso",
}

export enum LayerTypeEnum {
    image = "image",
    expandRect = "expandRect",
    lassoInpaint = "lassoInpaint",
    inpaint = "inpaint",
    handdraw = "handdraw",
    img2img = "img2img",
    sketch2img = "sketch2img",
    nullLayer = "null",
    layers = "layers"
}

export enum AIFunctionEnum {
    expand = "expand",
    lasso = "lasso",
    inpaint = "inpaint",
    img2img = "img2img",
    handdraw = "handdraw",
    img2sketch = "img2sketch"
}

const tmpLayerTypes = [
    LayerTypeEnum.expandRect,
    LayerTypeEnum.lassoInpaint,
    LayerTypeEnum.img2img,
    LayerTypeEnum.sketch2img
]

export const brushLayerTypes = [
    LayerTypeEnum.inpaint,
    LayerTypeEnum.handdraw
]

interface aditorDataType {
    [key: string]: any;
    id: number;
    name: string;
    prompt: string;
    neg_prompt: string;
    denoising_strength: number;
    type: LayerTypeEnum;
    mask_type: "origin" | "mask" | "scrawl";
    on_moving: any[];
    on_scaling: any[];
    bind_image_id: number;
}

export type AditorFabricObject = fabric.Object & {
    aditorData: aditorDataType
}

export class CanvasState{
    private canvas!: fabric.Canvas
    private layers: Ref<AditorFabricObject[]> = ref([])
    private saveCallback: Function
    private redoCallback: Function
    private undoCallback: Function

    private state:canvasStateInterface = reactive({
        brushSize: 15,
        brushColor: '#000000',
        aiStrength: 80,
        isDragging: false,
        lastPosX: 0,
        lastPosY: 0,
        selectedLayersIds: [],
        selectedTool: CanvasToolEnum.select,
        lastOptImageId: 0,
        postivePrompt: "",
        negativePrompt: "",
        n_iter: 1,
        steps: 20,
        viewPortTransform: [1, 0, 0, 1, 0, 0],
    })

    private history:{
        canvas: any[],
        currentIndex: number,
        states: any[],
    } = reactive({
        currentIndex: -1,
        canvas: [],
        states: [],
    })

    private renderHookLock:boolean = false                      // 渲染钩子锁
    private canvasRenderTimer:number = 0                        // 渲染计时器
    private isRenderByUndoRedo:boolean = false                  // 是否是通过撤销重做触发的渲染
    private isRenderByUndoRedoHook:boolean = false              // 是否是通过撤销重做钩子触发的渲染
    private lastOpsImageLayerID:number = 0                      // 上一次操作的图像ID
    private isResizeCanvas:boolean = false                      // 是否正在调整画布大小
    private isResizeView:boolean = false                        // 是否正在调整视图大小

    private brushPathStr = ''
    private brushStarted = false
    private brushingLock = false                                // 画笔锁
    private isSelChangeByTool:boolean = false

    constructor(saveCallback: Function = ()=>{}, undoCallback: Function = ()=>{}, redoCallback: Function = ()=>{}){
        this.saveCallback = saveCallback
        this.undoCallback = undoCallback
        this.redoCallback = redoCallback
    }

    bindCanvas = (canvas: fabric.Canvas) => {
        this.canvas = canvas

        canvas.on('mouse:wheel', (event)=>{
            var delta = event.e.deltaY;
            this.isResizeView = true
            if (delta > 0) {
                // 向下滚动，缩小画布
                canvas.zoomToPoint({ x: (1200 / 2) * 0.666, y: (800 / 2) * 0.666 }, canvas.getZoom() * 0.9);
            } else {
                // 向上滚动，放大画布
                canvas.zoomToPoint({ x: (1200 / 2) * 0.666, y: (800 / 2) * 0.666 }, canvas.getZoom() * 1.1);
            }
    
    
            // 阻止事件继续传播
            event.e.preventDefault()
            event.e.stopPropagation()
        })
    
        canvas.on('selection:created', (_options)=>{
            this.selChangeHook()
        })
    
        canvas.on('selection:updated', (_options)=>{
            this.selChangeHook()
        })
    
        canvas.on('selection:cleared', (_options)=>{
            this.selChangeHook()
        })
    
        canvas.on('object:modified', (_options)=>{
        })
    
        canvas.on('after:render', (_options) => {
            this.afterRenderHook()
        })
    
        canvas.on('mouse:down:before', (_options) => {
            if (this.canvas!.isDrawingMode) {
                this.brushingLock = true
            }
        })
    
        canvas.on('mouse:down', (_options) => {
            if (this.state.selectedTool === CanvasToolEnum.move) {
                this.state.isDragging = true
                this.state.lastPosX = _options.e.clientX // lastPosX 是自定义的
                this.state.lastPosY = _options.e.clientY // lastPosY 是自定义的
            } else if (this.state.selectedTool == CanvasToolEnum.lasso) {

                var pointer = canvas.getPointer(_options.e);
                this.brushPathStr = 'M ' + pointer.x + ' ' + pointer.y,
                this.brushStarted = true;
            }
        })
    
    
        canvas.on('mouse:move', (_options) => {
            if (this.state.isDragging) {
                let evt = _options.e
                let vpt = canvas.viewportTransform // 聚焦视图的转换
                if(vpt == undefined){
                    return
                }
                vpt[4] += evt.clientX - this.state.lastPosX
                vpt[5] += evt.clientY - this.state.lastPosY
                this.state.lastPosX = evt.clientX
                this.state.lastPosY = evt.clientY
                canvas.requestRenderAll() // 重新渲染
            }
    
            if (this.state.selectedTool == CanvasToolEnum.lasso) {
                if (!this.brushStarted) return;
                let pointer = canvas.getPointer(_options.e);
                this.brushPathStr += ' L ' + pointer.x + ' ' + pointer.y
            }
        })
        
        canvas.on('mouse:up', (_options) => {
            if (this.state.isDragging) {
                canvas.setViewportTransform(canvas.viewportTransform!) // 设置此画布实例的视口转换  
                this.state.isDragging = false // 关闭移动状态
            }
            if (canvas.isDrawingMode) {
                this.brushingLock = false
            }
        })
    
        canvas.on('path:created', (_options) => {
            const _create_lassoinpaintlayer = () => {
                const image_layer = this.selectedLayer
                if (image_layer == undefined) {
                    return
                }
                const left = image_layer.left || 0
                const top = image_layer.top || 0
                const right = (image_layer.left || 0) + (image_layer.width || 0) * (image_layer.scaleX || 1)
                const bottom = (image_layer.top || 0) + (image_layer.height || 0) * (image_layer.scaleY || 1)
    
                let clearArray = this.brushPathStr.replace(/M | Z|L /g, "").split(" ")
                const processArray = []
                for (let i = 0; i < clearArray.length; i++) {
                    let num_value = parseFloat(clearArray[i])
                    if (i % 2 === 1) {
                        if (num_value < top) {
                            num_value = top
                        } else if (num_value > bottom) {
                            num_value = bottom
                        }
                    } else {
                        if (num_value < left) {
                            num_value = left
                        } else if (num_value > right) {
                            num_value = right
                        }
                    }
    
                    processArray.push(num_value)
                }
    
                // var arr = [123.123, 43.23, 23.32, 35.123];
                const processStr = processArray.reduce(function (acc, curr, index, _array) {
                    if (index == 0) {
                        acc += "M " + curr.toFixed(3) + " ";
                    } else if (index % 2 === 0) {
                        acc += "L " + curr.toFixed(3) + " ";
                    } else if (index == processArray.length - 1) {
                        acc += curr.toFixed(3) + " Z";
                    } else {
                        acc += curr.toFixed(3) + " ";
                    }
                    return acc;
                }, "");
                const add_object = new fabric.Path(processStr, {
                    fill: 'rgba(0,0,0,0.3)',
                    lockMovementX: true, // 禁止移动 
                    lockMovementY: true, // 禁止移动
                    lockScalingX: true, // 禁止缩放X
                    lockScalingY: true, // 禁止缩放Y
                    lockRotation: true, // 禁止旋转
                    lockScalingFlip: true,
                });
                this.initAditorData(add_object, "套索路径", LayerTypeEnum.lassoInpaint, {
                    denoising_strength: 75,
                    bind_image_id: image_layer.aditorData.id,
                })
                canvas.add(add_object);
                canvas.setActiveObject(add_object)
            }
    
            if (canvas.isDrawingMode) {
                this.brushingLock = false
                this.brushStarted = false
            }
    
            const path = (_options as any).path;
            // const allLayers = canvas.getObjects()
            canvas.remove(path)
            // 如果是画笔工具
            if (this.state.selectedTool == CanvasToolEnum.brush) {
                const brushLayer = this.selectedLayer
    
                if (brushLayer != undefined && brushLayerTypes.includes(brushLayer.aditorData.type)) {
                    (brushLayer as fabric.Group & AditorFabricObject).addWithUpdate(path)
                    brushLayer.setCoords()
                    canvas.setActiveObject(brushLayer)
                    canvas.renderAll();
                }
            } else if (this.state.selectedTool == CanvasToolEnum.lasso) { // 如果是套索工具
                let pointer = canvas.getPointer(_options.e);
                this.brushPathStr += ' L ' + pointer.x + ' ' + pointer.y + ' Z'
                _create_lassoinpaintlayer()
                // 还原路径
                this.brushPathStr = ""
            }
    
        })
    
        canvas.on('drop', (_options) => {
            const e:DragEvent = _options.e as DragEvent
            e.stopPropagation()
            e.preventDefault()

            if(e == undefined){
                return
            }

            let files = e.dataTransfer?.files

            if (!files || files.length === 0) {
                return
            }

            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                if (['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
                    const reader = new FileReader();
                    const image = new Image();

                    reader.onload = () => {
                        const dataUrl = reader.result;
                        // 处理文件url
                        image.src = dataUrl as string
                    }

                    image.onload = () => {
                        const fabricImage = new fabric.Image(image) as (fabric.Image & AditorFabricObject)
                        this.initAditorData(fabricImage, "自定义图片", LayerTypeEnum.image, { denoising_strength: 0 })

                        fabricImage.on("moving", () => {
                            fabricImage.aditorData.on_moving.forEach(callback => callback(fabricImage));
                        })
                        fabricImage.on("scaling", () => {
                            fabricImage.aditorData.on_scaling.forEach(callback => callback(fabricImage));
                        })

                        canvas.add(fabricImage);
                        canvas.renderAll()
                    };
                    reader.readAsDataURL(file);
                }
            }
        })

    }

    /**
     * 通用信息更新：更新当前选中canvasStates.selected_layers_ids属性 
     * @param selectedTool
     * @returns
     */
    private selChangeHook = () => {
        this.updateSelInfo()
        if (this.isSelChangeByTool == false) {
            // 检查当前选区更换后是否需要切换工具
            if (this.state.selectedTool === CanvasToolEnum.brush) {
                if (brushLayerTypes.includes(this.selectedLayerType)) { // 如果当前操作对象是合法的，不用换
                    this.setCanvasTool(CanvasToolEnum.brush)
                } else {
                    this.setCanvasTool(CanvasToolEnum.select)
                }
            } else if (this.state.selectedTool === CanvasToolEnum.move) {
                if (this.selectedLayerType != LayerTypeEnum.nullLayer) {
                    this.setCanvasTool(CanvasToolEnum.select)
                } else {
                    this.setCanvasTool(CanvasToolEnum.move)
                }
            } else if (this.state.selectedTool === CanvasToolEnum.select) {
                this.setCanvasTool(CanvasToolEnum.select)
            } else if (this.state.selectedTool === CanvasToolEnum.lasso) {
                if (this.selectedLayerType == LayerTypeEnum.image) { // 如果当前操作对象是合法的，不用换
                    this.setCanvasTool(CanvasToolEnum.lasso)
                } else {
                    this.setCanvasTool(CanvasToolEnum.select)
                }
            }
        }
    }

    /** 通用信息更新：根据当前fabric.js的selection层信息更新 canvasState 选区属性 selected_layers_id */
    private updateSelInfo = () => {
        // 只有不在brushing和不是undoRedo方法触发的renderHook才更具当前状态更新选区
        if (this.brushingLock == false && this.isRenderByUndoRedo == false) {
            // 获取并更新当前选区信息
            const selectedObject = this.canvas.getActiveObject()
            if (selectedObject != undefined && selectedObject != null) {
                if ('aditorData' in selectedObject) { // 单选情况
                    this.state.selectedLayersIds = [(selectedObject as AditorFabricObject).aditorData.id];
                } else { // 多选情况
                    const selectedObjects = this.canvas.getActiveObjects() as AditorFabricObject[]
                    this.state.selectedLayersIds = selectedObjects.map(obj => obj.aditorData.id)
                }
            } else {
                this.state.selectedLayersIds = []
            }
            this.state.lastOptImageId = this.lastOpsImageLayerID
            this.lastOpsImageLayerID = 0
        }
    }

    private afterRenderHook = () => {
        this.setLayers()
        // 单独保存视口转换信息
        this.state.viewPortTransform = this.canvas.viewportTransform || [1, 0, 0 ,1 ,0, 0]
        if (this.renderHookLock) {
        } else {
            clearTimeout(this.canvasRenderTimer)
            this.canvasRenderTimer = setTimeout(() => {
                this.renderHookLock = true
                if (this.isRenderByUndoRedo) {
                    if (this.isRenderByUndoRedoHook) {
                    } else {
                        this.canvasUndoRedoHook()
                    }
                    this.isRenderByUndoRedo = false
                } else {
                    this.clearTmpLayer()
                    this.saveHistory()
                }
                this.renderHookLock = false
            }, 300) as any
        }
    }

    /**
     * 给fabric.Object对象添加并初始化aditorData
     * @param obj 
     * @param name 
     * @param type 
     * @param default_config 
     */
    private initAditorData = (obj:fabric.Object, name:string, type = LayerTypeEnum.handdraw, default_config = {}) => {

        function generateID() {
            var timestamp = new Date().getTime();
            var randomNum = Math.floor(Math.random() * 9999 + 1000); // 生成四位随机数
            var id = Number(timestamp + String(randomNum)); // 将时间戳和随机数拼接成ID
            // 转成数字
            return id;
        }

        obj.set("aditorData" as keyof fabric.Object, {
            id: generateID(),
            name: name,
            prompt: "",
            neg_prompt: "",
            prompt_arr: [],
            neg_prompt_arr: [],
            denoising_strength: 50,
            type,
            mask_type: "origin", // origin-使用原图, mask-使用mask本身, scrawl-使用mask并且调用tile模型

            on_moving: [],
            on_scaling: [],
            bind_image_id: 0,
        })
        this.updateAditorData(obj as AditorFabricObject, default_config as aditorDataType)
    }

    private updateAditorData = (obj: AditorFabricObject, updateInfo: aditorDataType) => {
        // 把updateInfo的属性赋值给obj.aditorData
        // updateInfo剔除不在aditorData中的属性
            Object.keys(updateInfo).forEach(key => {
            if (obj.aditorData.hasOwnProperty(key)) {
                obj.aditorData[key] = updateInfo[key];
            }
        });
    }

    private setLayers = () => {
        const allLayers = this.canvas.getObjects()
        this.layers.value = allLayers as AditorFabricObject[]
    }

    private getAditorObjects = () => {
        return this.canvas.getObjects() as AditorFabricObject[]
    }

    /** 画布的撤销和重做函数的钩子函数功能 */
    private canvasUndoRedoHook = () => {
        this.isRenderByUndoRedoHook = true
        // const canvas = this.history.canvas[this.history.currentIndex]
        // const state = this.history.states[this.history.currentIndex]
        // this.state = Object.assign(this.state, state)
        // 如果是一个选中元素，那么激活这个选中元素，如果选区是多个，不激活，并且还原选区
        if (this.state.selectedLayersIds.length === 1) {
            this.activeTmpLayer()
            this.setActiveObject(this.selectedLayer)
            this.canvas.renderAll()
        } else if (this.state.selectedLayersIds.length > 1) {
            this.state.selectedLayersIds = []
            this.canvas.renderAll()
        }
        // this.updateAditorNodeData(canvas, state)
        this.isRenderByUndoRedoHook = false
    }

    /** 这个函数实际并没有激活层，只是遍历了当前的tmp层，对需要进行操作的进行初始化操作 */
    private activeTmpLayer = () => {
        this.getAditorObjects().forEach((obj) => {
            if (tmpLayerTypes.includes(obj.aditorData.type)) {
                if (obj.aditorData.type == LayerTypeEnum.expandRect) {
                    obj.on("scaling", this.initOnScaling)
                }
            }
        })
    }

    /** 清空tmp层，再 afterRenderHook中，如果不是undoRedo，那么渲染操作后，判断当前激活层，不是extend等layer就清除layer信息*/
    private clearTmpLayer = () => {
        let isRemoved = false
        this.getAditorObjects().forEach((obj) => {
            if (tmpLayerTypes.includes(obj.aditorData.type)) { // 对于临时层判断当前选中的是不是临时层，不是的话清除
                if (this.selectedLayerID != obj.aditorData.id) {
                    this.canvas.remove(obj)
                    isRemoved = true
                }
            }
        })
        if (isRemoved) {
            this.canvas.renderAll()
        }
    }
    

    // 添加expand的时需要初始化的监听器
    private initOnScaling = (e:fabric.IEvent<MouseEvent>) => {
        const ops_object = this.getLastOptImage()
        if(ops_object == undefined || e.transform == undefined){
            return
        }
        // 左上角开始依次是 tl mt tr mr br mb bl ml 
        const corner = e.transform.corner
        const obj = e.transform.target

        const targetScaleX = ops_object.scaleX || 1
        const targetScaleY = ops_object.scaleY || 1
        const maxLeft = ops_object.left || 0
        const maxTop = ops_object.top || 0
        const width = ops_object.width || 0
        const height = ops_object.height || 0
        const minRight = maxLeft + targetScaleX * width
        const minBottom = maxTop + targetScaleY * height

        const objLeft = obj.left || 0
        const objTop = obj.top || 0
        const objScaleX = obj.scaleX || 1
        const objScaleY = obj.scaleY || 1
        const objWidth = obj.width || 0
        const objHeight = obj.height || 0
        const objRight = objLeft + objScaleX * objWidth
        const objBottom = objTop + objScaleY * objHeight
        const beforeScaleWidthScale = e.transform.scaleX
        const beforeScaleHeightScale = e.transform.scaleY

        const beforeTop = e.transform.original.top
        const beforeLeft = e.transform.original.left
        const beforeAddLeftRate = Math.abs((beforeLeft - maxLeft) / objWidth)
        const beforeAddTopRate = Math.abs((maxTop - beforeTop) / objHeight)

        // 连续扩图还是有偏移量问题
        if (['tr', 'mr', 'br'].includes(corner)) {
            if (objRight < minRight) {
                const fixedRate = (minRight - objRight) / (width)
                obj.scaleX = objScaleX + fixedRate
            }
        }

        if (['tl', 'ml', 'bl'].includes(corner)) {
            if (objLeft > maxLeft) {
                const newScale = (beforeScaleWidthScale * objWidth) / width
                obj.left = maxLeft
                obj.scaleX = newScale - beforeAddLeftRate
            }
        }

        if (['br', 'mb', 'bl'].includes(corner)) {
            if (objBottom < minBottom) {
                const fixedRate = (minBottom - objBottom) / (height)
                obj.scaleY = objScaleY + fixedRate
            }
        }

        if (['tl', 'mt', 'tr'].includes(corner)) {
            if (objTop > maxTop) {
                const newScale = (beforeScaleHeightScale * objHeight) / height
                obj.top = maxTop
                obj.scaleY = newScale - beforeAddTopRate
            }
        }

    }

    private getLastOptImage = () => {
        if (this.state.lastOptImageId > 0) {
            return this.findLayerByID(this.state.lastOptImageId)
        } else {
            return undefined
        }
    }

    public saveHistory = () => {
        // 自动画布大小调整不需要保存历史记录
        if(this.isResizeCanvas){
            this.isResizeCanvas = false
            return 
        }

        if(this.isResizeView){
            this.isResizeView = false
            return
        }

        const _dfsCopy = (obj: any) => {
            if (typeof obj !== 'object') {
                return obj
            }
            const newObj = Array.isArray(obj) ? [] : {}
            for (let key in obj) {
                (newObj as {[key:string]: any})[key] = _dfsCopy(obj[key])
            }
            return newObj
        }

        const store_attributes = [
            "aditorData",
            "selectable",
            "lockMovementX",
            "lockMovementY",
            "lockScalingX",
            "lockScalingY",
            "lockRotation",
            "lockScalingFlip",
            "cornerColor",
            "cornerStyle",
        ]

        const canvas = this.canvas.toDatalessJSON(store_attributes); // From源码:传入需要额外保存的自定义属性，通过[$key]的方式
        const state = _dfsCopy(toRaw(this.state))
        this.updateAditorNodeData(canvas, state)
    }

    private updateAditorNodeData = (saveCanvas: any, saveCanvasState:any)=>{
        const data = {
            canvas: saveCanvas,
            state: saveCanvasState
        }
        this.saveCallback && this.saveCallback(data)
    }

    private setActiveObject = (object: AditorFabricObject | undefined | null) => {
        if (object) {
            this.canvas.setActiveObject(object)
        }
    }

    get selectedLayer():AditorFabricObject | undefined{
        if (this.state.selectedLayersIds.length == 1) {
            return this.findLayerByID(this.state.selectedLayersIds[0])
        } else if (this.state.selectedLayersIds.length == 0) {
            return undefined
        } else {
            return undefined
        }
    }

    get selectedLayerID():number{
        if (this.state.selectedLayersIds.length == 1) {
            return this.state.selectedLayersIds[0]
        } else if (this.state.selectedLayersIds.length == 0) {
            return -1
        } else {
            return -1
        }
    }
    
    get selectedLayerType(){

        if (this.state.selectedLayersIds.length == 1) {
            return this.selectedLayer?.aditorData.type || LayerTypeEnum.nullLayer
        } else if (this.state.selectedLayersIds.length == 0) {
            return LayerTypeEnum.nullLayer
        } else {
            return LayerTypeEnum.nullLayer
        }
    }

    get funcName(){
        const layerType = this.selectedLayerType
        if (layerType == LayerTypeEnum.expandRect) {
            return "：扩图"
        } else if (layerType == LayerTypeEnum.handdraw) {
            return "：手绘出图"
        } else if (layerType == LayerTypeEnum.img2img) {
            return "：图生图"
        } else if (layerType == LayerTypeEnum.inpaint) {
            return "：涂鸦修图"
        } else if (layerType == LayerTypeEnum.lassoInpaint) {
            return "：套索修图"
        } else if (layerType == LayerTypeEnum.sketch2img) {
            return "：草图生图"
        } else {
            return ""
        }
    }

    get getCanvas(){
        return this.canvas
    }

    public getLayerTypeByID(id:number){
        const layer = this.findLayerByID(id)
        if (layer) {
            return layer.aditorData.type
        } else {
            return LayerTypeEnum.nullLayer
        }
    }

    public findLayerByID(id:number){
        if (id === undefined || id === null || id === 0) {
            return undefined
        } else {
            if(this.layers.value === null){
                return undefined
            }
            return toRaw(this.layers.value.find(obj => obj.aditorData.id === id))
        }
    }

    get rawState(){
        return toRaw(this.state)
    }

    //******************************** 响应式变量集合 *************************************//
    public brushSizeComputed = computed({
        get: () => this.state.brushSize,
        set: (value: number) => this.state.brushSize = value
    })
    public brushColorComputed = computed({
        get: () => this.state.brushColor,
        set: (value: string) => this.state.brushColor = value
    })
    public aiStrengthComputed = computed({
        get: () => this.state.aiStrength,
        set: (value: number) => this.state.aiStrength = value
    })
    public selectedToolComputed = computed({
        get: () => this.state.selectedTool,
        set: (value: CanvasToolEnum) => {
            this.isSelChangeByTool = true
            this.setCanvasTool(value)
        }
    })
    public nIterComputed = computed({
        get: () => this.state.n_iter,
        set: (value: number) => this.state.n_iter = value
    })
    public allShowLayersComputed = computed((): AditorFabricObject[]=>{
        /**获得所有要展示的层 */
        const layers = this.layers.value!.filter((item) => {
            return !tmpLayerTypes.includes(item.aditorData.type)
        })

        if (layers.length == 0) {
            return []
        }else{
            return layers
        }

    })
    public postivePromptComputed = computed({
        get: () => this.state.postivePrompt,
        set: (value: string) => this.state.postivePrompt = value
    })
    public negativePromptComputed = computed({
        get: () => this.state.negativePrompt,
        set: (value: string) => this.state.negativePrompt = value
    })

    /**
     * 用来主动的设置画布的工具
     * @param selectedTool 
     * @returns 
     */
    private setCanvasTool = (selectedTool: CanvasToolEnum) => {
        const _disableSelect = () => {
            const objects = this.canvas.getObjects();
            for (var i in objects) {
                objects[i].selectable = false;
            }
        }
        const _enableSelect = () => {
            const objects = this.canvas.getObjects();
            for (var i in objects) {
                objects[i].selectable = true;
            }
        }
    
        if (selectedTool == CanvasToolEnum.select) {
            this.canvas.isDrawingMode = false
            this.canvas.notAllowedCursor = "allowed"
            this.state.selectedTool = selectedTool
            this.canvas.selection = true                            // 添加这行代码来启动圈选框
            _enableSelect()
        } else if (selectedTool == CanvasToolEnum.move) {
            this.canvas.isDrawingMode = false
            this.canvas.notAllowedCursor = "not-allowed"
            this.state.selectedTool = selectedTool
            this.canvas.selection = false                            // 添加这行代码来禁用圈选框
            _disableSelect()
        } else if (selectedTool == CanvasToolEnum.brush) {
            // 检查当前图层是否符合绘画条件 - 圈选重绘层,涂抹重绘层,手绘出图层
            if ([LayerTypeEnum.handdraw, LayerTypeEnum.inpaint, LayerTypeEnum.lassoInpaint].includes(this.selectedLayerType)) {
                this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
                this.canvas.freeDrawingBrush.color = this.state.brushColor
                this.canvas.freeDrawingBrush.width = this.state.brushSize
                this.canvas.isDrawingMode = true
                this.state.selectedTool = selectedTool
                _disableSelect()
            }
        } else if (selectedTool == CanvasToolEnum.lasso) {
            if (this.selectedLayerType == LayerTypeEnum.image) {
                this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
                this.canvas.freeDrawingBrush.color = this.state.brushColor
                this.canvas.freeDrawingBrush.width = 3
                this.canvas.isDrawingMode = true
                this.state.selectedTool = selectedTool
                _disableSelect()
            }
        }
    
        if (this.isSelChangeByTool == false) {
            return
        } else {
            // 根据情况改变选区
            if (selectedTool == CanvasToolEnum.move) {
                this.canvas.discardActiveObject()
                this.canvas.renderAll()
            } else if (selectedTool == CanvasToolEnum.lasso) {
    
            }
            this.isSelChangeByTool = false
        }

    }


    // ************************** 公共接口 ************************// 

    /** AI功能按钮 */
    public aiFuncEvent = (ai_func: AIFunctionEnum) => {
        if (ai_func == AIFunctionEnum.handdraw) {
            this.aiFuncAddHanddraw()
        } else if (ai_func == AIFunctionEnum.expand) {
            this.aiFuncExpand()
        } else if (ai_func == AIFunctionEnum.inpaint) {
            this.aiFuncInpaint()
        } else if (ai_func == AIFunctionEnum.img2img) {
            this.aiFuncImg2Img()
        } else if (ai_func == AIFunctionEnum.img2sketch) {
            this.aiFuncimg2sketch()
        }
    }

    /** aiFunc 草图绘制 */
    public aiFuncAddHanddraw = () => {
        const group = new fabric.Group([], {
            left: 0,  // x轴坐标
            top: 0,   // y轴坐标
            width: 800,   // 宽度为零
            height: 600   // 高度为零
        });
        this.initAditorData(group, "手绘出图层", LayerTypeEnum.handdraw, { denoising_strength: 75 })
        this.canvas.add(group);
        this.canvas.renderAll();
    }

    /** aiFunc 扩图 */
    public aiFuncExpand = () => {
        const image_layer = this.selectedLayer
        if (image_layer == undefined) {
            return
        }

        if (image_layer.aditorData.type === LayerTypeEnum.image) {
            this.lastOpsImageLayerID = image_layer.aditorData.id
            const scaleX = image_layer?.scaleX ? image_layer.scaleX : 1.0
            const scaleY = image_layer?.scaleY ? image_layer.scaleY : 1.0
            const add_object = new fabric.Rect({
                left: image_layer.left,
                top: image_layer.top,
                width: image_layer.width,
                height: image_layer.height,
                fill: 'rgba(0,0,0,0)',
                stroke: 'rgba(0,0,0,0)',
                strokeWidth: 0,
                lockMovementX: true, // 禁止移动 
                lockMovementY: true, // 禁止移动
                lockScalingX: false, // 可缩放
                lockScalingY: false, // 可缩放
                lockRotation: true, // 禁止旋转
                lockScalingFlip: true,
                scaleX: scaleX,
                scaleY: scaleY,
            })

            add_object.setOptions({
                cornerColor: 'black',
                cornerStyle: 'inverted'
            })

            add_object.set({
                strokeLineCap: 'butt', // 设置虚线连接点的形状（可选）
            });

            add_object.on("scaling", this.initOnScaling)

            this.initAditorData(add_object, "扩图层", LayerTypeEnum.expandRect, {
                denoising_strength: 75,
                bind_image_id: image_layer.aditorData.id
            })

            this.canvas.add(add_object)
            this.canvas.setActiveObject(add_object)
            this.canvas.renderAll()

        } else {
            console.log("选中对象无法扩图")
        }
    }

    /** aiFunc 笔刷重绘图片 */
    public aiFuncInpaint = () => {
        // 当前绑定的图像ID
        const image_layer = this.selectedLayer
        if(image_layer == undefined) return
        if (image_layer.aditorData.type === LayerTypeEnum.image) {
            // 先生成inpaint的图层
            const left = image_layer.left
            const top = image_layer.top

            const group = new fabric.Group([], {
                left,  // x轴坐标
                top,   // y轴坐标
                width: (image_layer.width || 0) * (image_layer.scaleX || 1),   // 宽度为零
                height: (image_layer.height || 0) * (image_layer.scaleY || 1)   // 高度为零
            });
            this.initAditorData(group, "涂抹重绘层", LayerTypeEnum.inpaint, {
                denoising_strength: 75,
                bind_image_id: image_layer.aditorData.id
            })
            this.canvas.add(group)
            this.canvas.setActiveObject(group)
            this.canvas.renderAll()

            // 模拟点击一次切换为画笔工具
            this.selectedToolComputed.value = CanvasToolEnum.brush
        }
    }

    /** aiFunc 图片生成图片 */
    public aiFuncImg2Img = () => {
        // 当前绑定的图像ID
        const image_layer = this.selectedLayer
        if(image_layer == undefined) return
        if (image_layer.aditorData.type === LayerTypeEnum.image) {
            // 先生成inpaint的图层
            const left = image_layer.left
            const top = image_layer.top

            const group = new fabric.Group([], {
                left,  // x轴坐标
                top,   // y轴坐标
                width: (image_layer.width || 0) * (image_layer.scaleX || 1),       // 宽度为零
                height: (image_layer.height || 0) * (image_layer.scaleY || 1),     // 高度为零
                lockMovementX: true, // 禁止移动 
                lockMovementY: true, // 禁止移动
                lockScalingX: true, // 禁止缩放X
                lockScalingY: true, // 禁止缩放Y
                lockRotation: true, // 禁止旋转
                lockScalingFlip: true,
            });
            this.initAditorData(group, "图生图", LayerTypeEnum.img2img, {
                denoising_strength: 75,
                bind_image_id: image_layer.aditorData.id
            })
            this.canvas.add(group)
            this.canvas.setActiveObject(group)
            this.canvas.renderAll()
        }
    }

    public aiFuncimg2sketch = () => {
        // 当前绑定的图像ID
        const image_layer = this.selectedLayer
        if(image_layer == undefined) return
        if (image_layer.aditorData.type === LayerTypeEnum.image) {
            // 先生成inpaint的图层
            const left = image_layer.left
            const top = image_layer.top

            const group = new fabric.Group([], {
                left,  // x轴坐标
                top,   // y轴坐标
                width: (image_layer.width || 0) * (image_layer.scaleX || 1),       // 宽度为零
                height: (image_layer.height || 0) * (image_layer.scaleY || 1),     // 高度为零
                lockMovementX: true, // 禁止移动 
                lockMovementY: true, // 禁止移动
                lockScalingX: true, // 禁止缩放X
                lockScalingY: true, // 禁止缩放Y
                lockRotation: true, // 禁止旋转
                lockScalingFlip: true,
            });
            this.initAditorData(group, "草图生图", LayerTypeEnum.sketch2img, {
                denoising_strength: 75,
                bind_image_id: image_layer.aditorData.id
            })
            this.canvas.add(group)
            this.canvas.setActiveObject(group)
            this.canvas.renderAll()
        }
    }

    public isSelectedLayer = (layer: AditorFabricObject) => {
        return this.state.selectedLayersIds.some(_id => _id === layer.aditorData.id)
    }

    /** 主动切换选区: 切换后调用renderAll,触发selection相关事件;并且调用被动切换工具函数 */
    public toggleLayer = (id: number) => {
        const layer = this.findLayerByID(id)
        if (layer) {
            // 当前选中的层和改变的不一样才调用renderAll
            if (this.state.selectedLayersIds.includes(layer.aditorData.id)){
                
            } else {
                this.canvas.setActiveObject(layer);
                this.canvas.renderAll();
            }
        }
        
    }

    public handleLayerForward = (id:number) => {
        const layer = this.findLayerByID(id)
        layer && this.canvas.bringForward(layer)
        this.canvas.renderAll()
    }

    public handleLayerBackward = (id:number) => {
        const layer = this.findLayerByID(id)
        layer && this.canvas.sendBackwards(layer)
        this.canvas.renderAll()
    }

    public handleDeleteLayer = (ids:number | number[]) => {
        // TODO: 删除的是image需要先清空相关的绑定图层
        if (Array.isArray(ids) && ids.length >= 1) {
            ids.forEach(id => {
                if (id >= 1) {
                    const layer = this.findLayerByID(id)
                    layer && this.canvas.remove(layer);
                }
            })
            this.canvas.renderAll()
        } else if (!isNaN(parseFloat(ids as unknown as string))) {
            const layer = this.findLayerByID(ids as number)
            layer && this.canvas.remove(layer);
            this.canvas.renderAll()
        }
    }

    /**
     * Canvas键盘事件处理函数,注意需要外层div元素设置tabIndex属性
     * @param e 
     * @returns 
     */
    public handleKeydown = (e:KeyboardEvent) => {
        if (e.ctrlKey) {
            // Ctrl + Z
            if (e.key === 'z' || e.key === 'Z') {
                this.undoCallback()
            } else if (e.key === 'y' || e.key === 'Y') {
                // Ctrl + Y
                this.redoCallback()
            } else if (e.key === 's') {
                // 保存分支，啥也别做
            }
        } else if (e.key == 'Delete') {
            // 删除层
            this.handleDeleteLayer(this.state.selectedLayersIds)
        }
        return false
    }

    /**
     * 从JSON字符串中加载画布
     * @param json 
     */
    public loadCanvasFromJSON = (data:{canvas?: string, state?: string}) => {
        const rawData = toRaw(data)
        try{
            if (rawData?.state) {
                this.state = Object.assign(this.state, rawData.state);
            }
            if (rawData?.canvas) {
                this.canvas.loadFromJSON(_fixFabricExportBug(rawData.canvas), ()=>{
                    // 对于loadFromJSON,默认等同执行了undoRedo操作，因此上undo redo锁
                    this.isRenderByUndoRedo = true
                    // 如果存在视口转换信息，那么需要设置视口转换信息;注意这个函数不能再render后执行
                    if (this.state.viewPortTransform) {
                        this.canvas.setViewportTransform(this.state.viewPortTransform);
                    }
                });
            }

        }catch(e){
            this.isRenderByUndoRedo = false
            console.error("加载画布数据失败,原因:")
            console.error(e)
        }
    }

    public undo = (data:{canvas:any, state:any}) => {
        this.isRenderByUndoRedo = true
        this.loadCanvasFromJSON(data)

    }
    public redo = (data:{canvas:any, state:any}) => {
        this.isRenderByUndoRedo = true
        this.loadCanvasFromJSON(data)
    }

    public resizeCanvas = ():number => {
        const width = calCanvasWidth(getWindowWidth())
        this.isResizeCanvas = true
        this.canvas.setDimensions({
            width: width,
            height: 589,
        })
        return width
    }
}

export const initCanvas = (canvasRef: HTMLCanvasElement, config:{width?: number, height?: number}={}): fabric.Canvas => {
    const defaultWidth  = calCanvasWidth(getWindowWidth())
    
    let width = calCanvasWidth(config.width || defaultWidth) 
    const canvas = new fabric.Canvas(canvasRef as HTMLCanvasElement , {
        width: width,
        height: 559,
    })

    canvas.setZoom(canvas.getZoom() * 0.666)

    return canvas
}


/**
 * 修复fabric.js导出的bug
 * fabric.js导出的JSON文件中，如果不存在strokeDashArray属性，fabric.js会默认为null,JS转成JSON时会被设置为{},实际应该是[]
 */
const _fixFabricExportBug = (obj: any) => {
    const _inner_method_ = (obj: any) => {
        for (let key in obj) {
            if (typeof obj[key] === 'object') {
                if (Object.keys(obj[key]).length === 0) {
                    obj[key] = null
                }
            }
        }
        if('objects' in obj && Array.isArray(obj.objects)){
            obj.objects.forEach((obj:any)=>{
                _inner_method_(obj)
            })
        }
    }
    _inner_method_(obj)
    return obj
}

// 根据浏览器大小和AditorCSS布局返回响应式宽度
const getWindowWidth = ()=>{
    // 280左边导航, 240工具栏 240图层栏 80内边距，30外边距
    const fixWidth = globalState.asideWidth + 240 + 240 + 80 + 30
    const innerWidth = window.innerWidth
    let width = innerWidth - fixWidth
    return width
}

// 根据AditorCSS的布局信息计算正确的Canvas大小
const calCanvasWidth = (width:number)=>{
    const minTotalWidth = 980
    const maxTotalWidth = 1440

    let calWidth = width
    calWidth = width + 480 < minTotalWidth ? minTotalWidth - 480 : width
    calWidth = calWidth + 480 > maxTotalWidth ? maxTotalWidth - 480 : calWidth
    return calWidth
}