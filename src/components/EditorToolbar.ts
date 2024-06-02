import { h, reactive, readonly, nextTick } from 'vue'
import { createAditorNode, AditorDocView, type VirtualSelection } from 'vue-aditor'
import {
    TextBold16Regular as BoldIcon
    , TextStrikethrough16Regular as StrikethroughIcon
    , TextItalic16Regular as ItalicIcon
    , TextUnderline16Regular as UnderlineIcon
    , TextT20Filled as TextIcon
    , TextEffects24Filled as TextColorIcon
    , TextHeader120Filled as H1Icon
    , TextHeader220Filled as H2Icon
    , TextHeader320Filled as H3Icon
    , TextAlignLeft20Filled as AlignLeftIcon
    , TextAlignCenter20Filled as AlignCenterIcon
    , Cut20Filled as CutIcon
    , Copy16Filled as CopyIcon
    , Delete16Filled as DeleteIcon
    , Grid16Filled as AIFunctionIcon
    , Translate16Regular as TranslateIcon
    , Mic16Filled as Txt2AudioIcon
    , Image16Filled as Txt2ImgIcon
    , BookQuestionMark20Filled as GPTWhyIcon
    , FlashAuto24Filled as GPTAutoIcon
    , Autocorrect24Filled as GPTTransIcon
    , MathFormula24Filled as MathIcon
    , Settings24Filled as SettingIcon
    , DrawShape24Filled as AIDrawIcon
} from '@vicons/fluent'

import { getSelectionAttributes, setSelectionAttributes} from './aditor_extensions/command'

import { aiAsk } from './aditor_extensions/aditorAIChatUtils.ts';

const TEXT_COLOR = {
    '黑色': 'rgb(0, 0, 0)'
    , '灰色': 'rgb(100, 106, 115)'
    , '红色': 'rgb(216, 57, 49)'
    , '橙色': 'rgb(222, 120, 2)'
    , '黄色': 'rgb(220, 155, 4)'
    , '绿色': 'rgb(46, 161, 33)'
    , '蓝色': 'rgb(36, 91, 219)'
    , '紫色': 'rgb(100, 37, 208)'
}

const BACKGROUND_COLOR = {
    '透明': 'rgba(0, 0, 0, 0)'
    , '浅灰色': 'rgb(242, 243, 245)'
    , '浅红色': 'rgb(251, 191, 188)'
    , '浅橙色': 'rgba(254, 212, 164, 0.8)'
    , '浅黄色': 'rgba(255, 246, 122, 0.8)'
    , '浅绿色': 'rgba(183, 237, 177, 0.8)'
    , '浅蓝色': 'rgba(186, 206, 253, 0.7)'
    , '浅紫色': 'rgba(205, 178, 250, 0.7)'
    , '中灰色': 'rgba(222, 224, 227, 0.8)'
    , '灰色': 'rgb(187, 191, 196)'
    , '红色': 'rgb(247, 105, 100)'
    , '橙色': 'rgb(255, 165, 61)'
    , '黄色': 'rgb(255, 233, 40)'
    , '绿色': 'rgb(98, 210, 86)'
    , '蓝色': 'rgba(78, 131, 253, 0.55)'
    , '紫色': 'rgba(147, 90, 246, 0.55)'
}

export enum TOOLBAR_TYPE {
    command = 'command',    // Normal form, usually used for a complete selection 
    prefix = 'prefix',      // usually used for hover selection, hover block element
    link = 'link',          // link form
    none = 'none',          // no toolbar
    keep = 'keep'           // 一般不会再真实TOOLBAR_TYPE中出现，用于Transform逻辑判定
}

export enum TOOLBAR_DISPLAY_STATE {
    show = 'show',
    onShow = 'onShow',
    hide = 'hide',
    onHide = 'onHide'
}

enum CommandType {
    style = 'style',
    operate = 'operate',
    add = 'add',
}

class Command {
    name: string
    _icon: ((_s: typeof state) => typeof TextIcon) | typeof TextIcon | null
    label: string
    _value: ((_s: typeof state, _:Command )=>any) | {modelName: string, componentName: string, fixPrompt?: string} | string | boolean | null 
    type: CommandType
    children?: Command[]
    isHighlightHook?: (_s: typeof state) => boolean

    /**
     * 构造函数
     * @param name 名称/key
     * @param icon 渲染的图标
     * @param label 展示名称
     * @param value 回传的参数，可能是一个回调函数，包含了state,也可能是一个对象，包含 modelName , 也可能是简单的字符串或者boolean
     * @param type 命令类型
     * @param children 子命令
     * @param isHighlightHook 是否高亮的钩子函数 
     */
    constructor(
        name: string
        , icon: ((_s: typeof state) => typeof TextIcon) | typeof TextIcon | null
        , label: string
        , value: ((_s:typeof state, _:Command )=>any) | {modelName: string, componentName: string, fixPrompt?: string} | string | boolean | null = null
        , type: CommandType = CommandType.style
        , children?: Command[]
        , isHighlightHook?: (_s: typeof state) => boolean) {
        this.name = name
        this._icon = icon
        this.label = label
        this.type = type
        this._value = value
        this.children = children
        this.isHighlightHook = isHighlightHook
    }
    get icon() {
        // 如果是函数，则调用，否则直接返回
        if (this._icon == null) {
            return null
        } else if (typeof this._icon === 'function') {
            return (this._icon as Function).call(this, state)
        } else if (typeof this._icon === 'object') {
            return h(this._icon)
        }
        return null
    }

    get highlight() {
        if (this.isHighlightHook == undefined) {
            return false
        }
        return this.isHighlightHook.call(this, state)
    }

    get stateValue() {
        if(this.name in state.attrs){
            return state.attrs[this.name as keyof typeof state.attrs]
        }else 
            return null
    }

    get value(){
        if(this._value == null){
            return null
        }else if(this._value === '$stateValue'){
            return !this.stateValue
        }else if (typeof this._value === 'function') {
            return (this._value as Function).call(this, state, this)
        }else
            return this._value
    }

    execute = async ({ key, value, setSelection }: { key: string, value: string | boolean | null, setSelection?: boolean }) => {
        const view = activeView()
        if(value == null){
            return
        }
        // 如果value是一个对象并且包含 modelName 属性
        if(typeof value === 'object' && 'modelName' in value){
            const {modelName, componentName, fixPrompt} = value
            if(modelName == undefined || componentName == undefined){
                return
            }
            const view = activeView() as AditorDocView
            let text = ''
            const {start, end} = view.docState.nodesel2globalpos(view.docState.vsels2Nodesels(vsels)[0])
            view.docState.traverseNodeByPos(start, end, (node, _p)=>{
                text += node.getTextByRange(start, end)
            })
            //如果text首尾有换行符，去掉
            text = text.replace(/^\n+|\n+$/g, "")
            const lastNode = view.docState.findNodeByPos(end)

            if(fixPrompt != undefined && typeof fixPrompt === 'string' && (fixPrompt as string).length > 0){
                text = fixPrompt + ':\n' + text
            }
            /** 上面通用获取选中的文本信息， 下面处理不同的AI参数 **/
            if(modelName === 'gpt3.5'){
                aiAsk(view, lastNode, modelName, {
                    name: modelName, // Add the missing 'name' property
                    role: 'user',
                    type: 'text',
                    data: [{
                        type: 'text',
                        text: text
                    }]
                })
            }else if(modelName === 'vits'){
                aiAsk(view, lastNode, modelName, {
                    name: modelName, // Add the missing 'name' property
                    role: 'user',
                    type: 'text',
                    data: [{
                        type: 'text',
                        text: "请帮我把下面文字转成语音:\n"+text
                    }],
                    params:{
                        text: text
                    }
                })
            }else if(modelName === 'sd2'){
                aiAsk(view, lastNode, modelName, {
                    name: modelName, // Add the missing 'name' property
                    role: 'user',
                    type: 'text',
                    data: [{
                        type: 'text',
                        text: "请根据下面文字做画\n"+text
                    }],
                    params:{
                        width: 800,
                        height: 600,
                        fname: 'txt2img',
                        cfg_scale: 7.5,
                        n_iter: 1,
                        steps: 20,
                        seed: -1,
                        // 这里进行索引
                        prompt: text,
                        negative_prompt: "(worst quality:2), (low quality:2), (normal quality:2), lowres, normal quality, ((monochrome)), ((grayscale)), skin spots, acnes, skin blemishes, age spot, (ugly:1.331), (duplicate:1.331), (morbid:1.21), (mutilated:1.21), (tranny:1.331), mutated hands, (poorly drawn hands:1.5), blurry, (bad anatomy:1.21), (bad proportions:1.331), extra limbs, (disfigured:1.331), (missing arms:1.331), (extra legs:1.331), (fused fingers:1.61051), (too many fingers:1.61051), (unclear eyes:1.331), lowers, bad hands, missing fingers, extra digit,bad hands, missing fingers, (((extra arms and legs)))",
                    }
                })
            }

            

        }else if(key !== 'insert_node'){
            const _vsels = setSelectionAttributes({ view: activeView() as AditorDocView, vsels, key, value, setSelection })
            nextTick(() => {
                if (view instanceof AditorDocView) {
                    if(_vsels == undefined){
                        vsels = []
                    }else{
                        vsels = []
                        _vsels.forEach((item) => {
                            vsels.push({
                                start: item.start,
                                end: item.end,
                                startOffset: item.startOffset,
                                endOffset: item.endOffset
                            })
                        })
                    }
                    state.attrs = getSelectionAttributes(view.docState, vsels)
                }
            })
        }else if(key == 'insert_node'){
            const childNode = createAditorNode(value as string, {}, {})
            if(!childNode){
                return 
            }
            const parentNode = createAditorNode('aditorParagraph', {}, {})
            parentNode.addChild(childNode)

            const _vsels = setSelectionAttributes({ view: activeView() as AditorDocView, vsels, key, value:[parentNode], setSelection })
            nextTick(() => {
                if (view instanceof AditorDocView) {
                    if(_vsels == undefined){
                        vsels = []
                    }else{
                        vsels = []
                        _vsels.forEach((item) => {
                            vsels.push({
                                start: item.start,
                                end: item.end,
                                startOffset: item.startOffset,
                                endOffset: item.endOffset
                            })
                        })
                    }
                    state.attrs = getSelectionAttributes(view.docState, vsels)
                }
            })

        }
        
    }
}


const state = reactive<{
    type: TOOLBAR_TYPE
    displayState: TOOLBAR_DISPLAY_STATE
    _transfromState: TOOLBAR_DISPLAY_STATE
    colorVisible: boolean
    prefixMenuVisible: boolean
    position: { x: number, y: number }
    attrs: ReturnType<typeof getSelectionAttributes>
}>({
    type: TOOLBAR_TYPE.none,
    displayState: TOOLBAR_DISPLAY_STATE.hide,
    _transfromState: TOOLBAR_DISPLAY_STATE.hide,
    colorVisible: false,
    prefixMenuVisible: false,
    position: { x: 0, y: 0 },
    attrs: {
        title: '正文',
        alignment: '左对齐',
        fontWeight: true,
        lineThrough: true,
        italic: true,
        underline: true,
        linkNum: 0,
        linkValue: '',
        color: '蓝色',
        backgroundColor: '浅红色'
    }
})

let activeView: () => AditorDocView | null = () => null
let vsels: VirtualSelection[] = []

const commands = () => {
    if (state.type === TOOLBAR_TYPE.command) {
        return defaultNormalCommands
    } else if (state.type === TOOLBAR_TYPE.prefix) {
        return defaultPrefixCommands
    }
    return defaultNormalCommands
}

const stateType = () => {
    return state.type
}

const setStateType = (val: TOOLBAR_TYPE) => {
    state.type = val
}

const clickColorButton = ()=>{
    state.colorVisible = !state.colorVisible
}

const clickPrefixButton = ()=>{
    state.prefixMenuVisible = !state.prefixMenuVisible
}

const displayState = () => {
    return state.displayState
}

const setDisplayState = (val: TOOLBAR_DISPLAY_STATE) => {
    state.displayState = val
}

const fontColor = () => {
    return TEXT_COLOR[state.attrs.color as keyof typeof TEXT_COLOR]
}

const backgroundColor = () => {
    return BACKGROUND_COLOR[state.attrs.backgroundColor as keyof typeof BACKGROUND_COLOR]
}

const setLinkValue = (value:string) =>{
    state.attrs.linkValue = value
}

const executeSetLink = ()=>{
    setSelectionAttributes({ view: activeView() as AditorDocView, vsels, key: 'href', value:state.attrs.linkValue, setSelection: true })
}

const defaultNormalCommands = [
    new Command('gpt_explain', GPTWhyIcon, '解释', {modelName: 'gpt3.5', componentName: 'aditorAIChat', fixPrompt:'请帮我解释下面内容'}, CommandType.style, [])
    , new Command('gpt_fix', GPTAutoIcon, '补全', {modelName: 'gpt3.5', componentName: 'aditorAIChat', fixPrompt:'请根据内容，帮我补全下面段落后面可能的内容'}, CommandType.style, [])
    , new Command('gpt_translate', GPTTransIcon, '翻译', {modelName: 'gpt3.5', componentName: 'aditorAIChat', fixPrompt:'帮我翻译下面内容，如果内容没有提示翻译成什么语言，识别语种，翻译成中文，如果目标语言是中文，则翻译成英文'}, CommandType.style, [])
    , new Command('txt2audio', Txt2AudioIcon, '转语音', {modelName: 'vits', componentName: 'aditorAIChat', fixPrompt:''}, CommandType.style, [])
    , new Command('txt2img', Txt2ImgIcon, '转图片', {modelName: 'sd2', componentName: 'aditorAIChat', fixPrompt:''}, CommandType.style, [])
    , new Command('format', AIFunctionIcon, 'format', 'format', CommandType.style, [
        new Command('fontWeight', BoldIcon, '加粗', '$stateValue', CommandType.style, [], function (s) { return s.attrs.fontWeight })
        , new Command('lineThrough', StrikethroughIcon, '删除线', '$stateValue', CommandType.style, [], function (s) { return s.attrs.lineThrough })
        , new Command('italic', ItalicIcon, '斜体', '$stateValue', CommandType.style, [], function (s) { return s.attrs.italic })
        , new Command('underline', UnderlineIcon, '下划线', '$stateValue', CommandType.style, [], function (s) { return s.attrs.underline })
    ])
]

const defaultPrefixCommands = [
    new Command('title', TextIcon, '正文', 'p', CommandType.style, [], (s) => s.attrs.title == '正文')
    , new Command('title', H1Icon, '标题1', '1', CommandType.style, [], (s) => s.attrs.title == '一级')
    , new Command('title', H2Icon, '标题2', '2', CommandType.style, [], (s) => s.attrs.title == '二级')
    , new Command('title', H3Icon, '标题3', '3', CommandType.style, [], (s) => s.attrs.title == '三级')
    , new Command('textAlign', AlignLeftIcon, '左对齐', 'left', CommandType.style, [], (s) => s.attrs.alignment == '左对齐')
    , new Command('textAlign', AlignCenterIcon, '居中对齐', 'center', CommandType.style, [], (s) => s.attrs.alignment == '居中对齐')
    , new Command('textAlign', AlignCenterIcon, '右对齐', 'right', CommandType.style, [], (s) => s.attrs.alignment == '右对齐')
    , new Command('fontWeight', BoldIcon, '加粗', '$stateValue', CommandType.style, [], function (s) { return s.attrs.fontWeight })
    , new Command('lineThrough', StrikethroughIcon, '删除线', '$stateValue', CommandType.style, [], function (s) { return s.attrs.lineThrough })
    , new Command('italic', ItalicIcon, '斜体', '$stateValue', CommandType.style, [], function (s) { return s.attrs.italic })
    , new Command('underline', UnderlineIcon, '下划线', '$stateValue', CommandType.style, [], function (s) { return s.attrs.underline })
    // , new Command('cut', CutIcon, '剪切', false, CommandType.operate, [], () => false)
    // , new Command('copy', CopyIcon, '复制', false, CommandType.operate, [], () => false)
    , new Command('delete', DeleteIcon, '删除', false, CommandType.operate, [], () => false)
    , new Command('math', MathIcon, '公式', 'aditorKatex', CommandType.add, [], ()=>false)
    , new Command('setting', SettingIcon, '设置', 'aditorConfig', CommandType.add, [], ()=>false)
    , new Command('aiDraw', AIDrawIcon, '画布', 'aditorCanvas', CommandType.add, [], ()=>false)
]

const defaultColorCommands = Object.keys(TEXT_COLOR).map((key) => {
    return new Command('color', TextColorIcon, key, TEXT_COLOR[key as keyof typeof TEXT_COLOR], CommandType.style)
})

const defaultBackgroundColorCommands = Object.keys(BACKGROUND_COLOR).map((key) => {
    return new Command('backgroundColor', null, key, BACKGROUND_COLOR[key as keyof typeof BACKGROUND_COLOR], CommandType.style)
})

const init = (getAditorView: () => AditorDocView | null, getToolbarHTMLElements: () => (HTMLElement | null)[], getContainer: () => HTMLElement | null, getPrefixIsShow: ()=>boolean) => {
    getToolbar = getContainer
    activeView = getAditorView
    toolbarHTMLElements = getToolbarHTMLElements
    prefixIsShow = getPrefixIsShow

    Object.keys(eventListener).forEach((key) => {
        document.removeEventListener(key, eventListener[key as keyof typeof eventListener])
        document.addEventListener(key, eventListener[key as keyof typeof eventListener])
    })
}
let getToolbar: () => HTMLElement | null = () => null
let prefixIsShow: () => boolean = () => false

const _setPosition = (x: number, y: number) => {
    state.position.x = x
    state.position.y = y
}

const _hookElement = (targetEl: Element, Container: Element) => {
    targetEl.parentNode?.removeChild(targetEl)
    Container.appendChild(targetEl)
}

/**
 * Get selection position
 * this function is used to get the position of the selection end node
 * the end node must be a text node, otherwise it will return null
 * @param e 
 * @param targetElement: the Editor root element
 * @returns {top:number, left:number} | null
 */
const _getSelectionPosition = (_e: MouseEvent, targetElement: HTMLElement): { top: number, left: number } | null => {
    // get endElement parent offset
    const _getClientOffset = (element: HTMLElement) => {
        let top = 0, left = 0;
        while (element) {
            top += element.offsetTop || 0;
            left += element.offsetLeft || 0;
            element = element.offsetParent as HTMLElement;
        }
        return { top: top, left: left };
    }

    const _dfsRightestNode = (node: Element | null): Node | null => {
        if(node == null) return null
        if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            if (node.children && node.children.length > 0) {
                // 从右到左搜索子节点
                for (let i = node.children.length - 1; i >= 0; i--) {
                    const rightestChild = _dfsRightestNode(node.children[i]);
                    if (rightestChild) {
                        return rightestChild;
                    }
                }
            } else {
                // 如果没有子节点，返回当前节点
                return node;
            }
        }
        // 如果节点是注释节点或者文档节点，返回null
        return null;
    }

    const buttonWidth = 40

    // 获得range
    const selection = window.getSelection()
    const range = selection?.getRangeAt(0)
    if (range == undefined || range == null) return null
    // let anchorNode = selection?.anchorNode
    // let anchorOffset = selection?.anchorOffset
    let startNode: HTMLElement | Node | null | undefined = selection?.anchorNode
    let startOffset = selection?.anchorOffset
    let endNode: HTMLElement | Node | null | undefined = selection?.focusNode
    let endOffset = selection?.focusOffset
    let isFrontToBack = false
    // By comparing anchorNode,startNode and endNode, determine whether the user is from front to back or from back to front
    if (startNode == null || endNode == null || startOffset == null || endOffset == null) {
        console.warn("Can't get one of 'anchorNode, startNode, endNode, anchorOffset, startOffset'")
        return null
    }

    // 如果选中了下一行，修正为前一个元素
    if (endOffset == 0 && startNode != endNode) {
        let maxLoop = 100
        let aditorId: null|undefined|string = null
        // 查找endNode的父节点，直到找到节点带aditorid属性的节点
        while (aditorId == null && endNode && endNode.parentElement != document.body && maxLoop > 0) {
            aditorId = endNode.parentElement?.getAttribute('aditorid')
            if (aditorId != null) {
                // 同时判断是否找到id=vid，如果找到，说明是aditor的根节点，不要使用parentElement
                let vid = endNode.parentElement?.getAttribute('vid')
                let id = endNode.parentElement?.getAttribute('id')
                if ((vid != null || id != null) && vid == id) {
                    break
                }
                endNode = endNode.parentElement
                break
            }
            maxLoop--
        }

        if (endNode == null) {
            return null
        }
        const preSibNode = endNode.previousSibling
        const rightestNode = _dfsRightestNode(preSibNode as Element)
        if(rightestNode == null ){
            return null 
        }else if(rightestNode.nodeType === Node.TEXT_NODE){
            endNode = rightestNode.parentElement || rightestNode
        }else{
            endNode = rightestNode
        }
        endOffset = rightestNode.textContent?.length || 0

    }

    // 修正节点到HTML元素，如果是文本节点，那么返回其父节点
    if(startNode.nodeType === Node.TEXT_NODE) startNode = startNode.parentElement
    if(endNode.nodeType === Node.TEXT_NODE) endNode = endNode.parentElement
    if(startNode == null || endNode == null) return null

    if (endNode === startNode) {
        isFrontToBack = endOffset >= startOffset
    } else {
        isFrontToBack = startNode?.compareDocumentPosition(endNode as Node) === Node.DOCUMENT_POSITION_FOLLOWING
    }
    const endNodeOffset = _getClientOffset(endNode as HTMLElement)
    const endNodeBrowserOffset = (endNode as HTMLElement).getBoundingClientRect()

    // 这一段获取到行级别的文本框的位置
    const allClientRanges = range.getClientRects()
    const filterClientRanges = []
    // fix bug double click bug:
    // 对于三击全选触发事件，如果选中了下一行的开头，即endOffset为0，并且开始容器不等于结束容器，此时需要放弃最后一个rect
    if (endOffset == 0 && startNode != endNode) {
        for (let i = 0; i < allClientRanges.length - 1; i++) {
            filterClientRanges.push(allClientRanges[i])
        }
    }else{
        filterClientRanges.push(...allClientRanges)
    }
    const lastRect = isFrontToBack ? filterClientRanges[filterClientRanges.length - 1] : filterClientRanges[0]
    const offsetX = isFrontToBack ? lastRect?.width : 0
    const parentNodeOffset = _getClientOffset(targetElement)

    if (lastRect == null) {
        console.warn("Can't get lastRect, not move toolBar")
        return null
    }

    // 文本高度偏移
    const textOffsetTop = 20

    // 最后计算各种偏移位置
    const toolbalTop = endNodeOffset.top + Math.abs(endNodeBrowserOffset.top - lastRect.top) + textOffsetTop
    const toolbalLeft = lastRect.left + offsetX - parentNodeOffset.left - buttonWidth / 2
    
    return {top: toolbalTop, left:toolbalLeft}
    
}

/**
 * The difference between _getSelectionPosition and _getSelectionPositionPrefix is that this function is used for single node selection
 * such as pictures, videos, etc., single selection, or when the block node is stationary, used to appear at the beginning of the paragraph
 */
const _getSelectionPositionPrefix = (e: MouseEvent, targetElement: HTMLElement): { top: number, left: number } | null => {
    const aditorRootNode = targetElement.getElementsByClassName('aditor')[0]
    if (aditorRootNode == null)
        return null
    // get endElement parent offset
    const _getClientOffset = (element: HTMLElement) => {
        let top = 0, left = 0;
        while (element) {
            top += element.offsetTop || 0;
            left += element.offsetLeft || 0;
            element = element.offsetParent as HTMLElement;
        }
        return { top: top, left: left };
    }

    let targetNode: HTMLElement | null = e.target as HTMLElement
    let maxLoop = 100
    while (targetNode && targetNode.parentElement != aditorRootNode && targetNode.parentElement != document.body && maxLoop > 0) {
        targetNode = targetNode.parentElement
        maxLoop--
    }
    if (targetNode == null || maxLoop <= 0) {
        console.warn("Can't get targetNode, not move toolBar")
        return null
    }

    if (targetNode.getAttribute('aditorid') == null || targetNode.getAttribute('aditorid') == undefined) {
        return null
    }

    const targetNodeOffset = _getClientOffset(targetNode)
    const parentNodeOffset = _getClientOffset(targetElement)
    const targetTop = targetNodeOffset.top - parentNodeOffset.top
    // const targetTop = targetNodeOffset.top - parentNodeOffset.top + targetNode.clientHeight / 2 - buttonHeight / 2
    const targetLeft = targetNodeOffset.left - parentNodeOffset.left
    return { top: targetTop, left: targetLeft }
}

/**
 * The difference between _getSelectionPosition and _getSelectionPositionPrefix is that this function is used for single node selection
 * such as pictures, videos, etc., single selection, or when the block node is stationary, used to appear at the beginning of the paragraph
 */
const _getSelectionPositionLink = (e: MouseEvent, targetElement: HTMLElement): { top: number, left: number } | null => {
    const aditorRootNode = targetElement.getElementsByClassName('aditor')[0]
    if (aditorRootNode == null)
        return null
    // get endElement parent offset
    const _getClientOffset = (element: HTMLElement) => {
        let top = 0, left = 0;
        while (element) {
            top += element.offsetTop || 0;
            left += element.offsetLeft || 0;
            element = element.offsetParent as HTMLElement;
        }
        return { top: top, left: left };
    }

    let targetNode: HTMLElement | null = e.target as HTMLElement

    if (targetNode == null) {
        console.warn("Can't get targetNode, not move toolBar")
        return null
    }

    const targetNodeOffset = _getClientOffset(targetNode)
    const parentNodeOffset = _getClientOffset(targetElement)
    const targetTop = targetNodeOffset.top - parentNodeOffset.top
    // const targetTop = targetNodeOffset.top - parentNodeOffset.top + targetNode.clientHeight / 2 - buttonHeight / 2
    const targetLeft = targetNodeOffset.left - parentNodeOffset.left
    return { top: targetTop, left: targetLeft }
}

// 取消动画锁更流畅
const beforeEnter = () => {
    // state._transfromState = TOOLBAR_DISPLAY_STATE.onShow
}
const afterEnter = () => {
    // state._transfromState = TOOLBAR_DISPLAY_STATE.show
}
const beforeLeave = () => {
    // state._transfromState = TOOLBAR_DISPLAY_STATE.onHide
}
const afterLeave = () => {
    // state._transfromState = TOOLBAR_DISPLAY_STATE.hide
}

enum SELECTION_TYPE {
    range = 'range',
    single = 'single',
    none = 'none'
}

const getSelectionType = (): SELECTION_TYPE => {
    // judge current selection type: range | single | none
    const selection = window.getSelection()
    if (selection == null) {
        return SELECTION_TYPE.none
    }
    if(selection?.type === 'None'){
        return SELECTION_TYPE.none
    }
    const range = selection?.getRangeAt(0)
    const anchorNode = range?.startContainer
    const anchorOffset = range?.startOffset
    const focusNode = range?.endContainer
    const focusOffset = range?.endOffset

    if (range) {
        // For the case where the mouse is pressed in the blank area, then moved to the edit area and then released
        // only using range.collapsed to judge will cause an error, you need to use getClientBoundingRect
        const boundingClientRect = range.getBoundingClientRect()
        if (boundingClientRect.width < 1) {
            return SELECTION_TYPE.none
        }
    } else {
        return SELECTION_TYPE.none
    }

    // if the selection is not collapsed, do not show the toolbar
    if (anchorNode === null || anchorOffset === null || focusNode === null || focusOffset === null) {
        return SELECTION_TYPE.none
    }
    if (anchorNode === focusNode && anchorOffset === focusOffset) {
        return SELECTION_TYPE.single
    } else if (anchorNode !== focusNode || anchorOffset !== focusOffset) {
        return SELECTION_TYPE.range
    }
    return SELECTION_TYPE.none
}
// the boundary of the event trigger object, is it in the toolbar, in the edit area, or outside the edit area
enum EVENT_TARGET_BOUNDARY {
    toolbar = 'toolbar',
    editor = 'editor',
    outside = 'outside',
    link = 'link'
}

let toolbarHTMLElements: () => (HTMLElement | null)[] = () => []

const getEventTargetBoundary = (e: Event, editorContainer: HTMLElement, tbHTMLElements: (HTMLElement | null)[]): EVENT_TARGET_BOUNDARY => {
    // the order of 'if' represents the priority of the boundary check

    // first check selection,if selection is on editorContainer, return editor
    const selection = window.getSelection()
    if (selection == null) {
        return EVENT_TARGET_BOUNDARY.outside
    }
    if(selection?.type === 'None'){
        return EVENT_TARGET_BOUNDARY.outside
    }

    // 注意：
    // 1.优先判断特殊类型，如aditorLink
    // 2.先判断e.target是否在editorContainer中，如果在，返回editor
    // 3.顺序不能乱，isOnTb的判断要在最后使用range判断之前，因为range会有遗留焦点问题
    const target = e.target as HTMLElement
    
    // 1
    if(target.getAttribute('aditor-link') != null){
        return EVENT_TARGET_BOUNDARY.link
    }else{
        // 尝试父节点获取
        const parentNode = target.parentElement
        if(parentNode && parentNode.getAttribute('aditor-link') != null){
            return EVENT_TARGET_BOUNDARY.link
        }
    }
    // 2
    if (editorContainer.contains(target)) {
        const view = activeView()
        if(view && view.docState.sels.getCurDOMBlockStartByNode(e.target as HTMLElement)){
            return EVENT_TARGET_BOUNDARY.editor
        }else{
            return EVENT_TARGET_BOUNDARY.outside
        }
    }
    // 3
    const isOnTb = tbHTMLElements.filter((item) => {
        if (item == null) {
            return false
        }
        return item.contains(target)
    })
    if (isOnTb.length > 0) {
        return EVENT_TARGET_BOUNDARY.toolbar
    }

    // find element with attrs "e-boundary" and "e-boundary" = "toolbar"
    let parentNode:HTMLElement | null = target
    let maxLoop = 1000
    while (parentNode != null && parentNode != document.body && maxLoop > 0) {
        if (parentNode.getAttribute('e-boundary') === 'toolbar') {
            return EVENT_TARGET_BOUNDARY.toolbar
        }
        parentNode = parentNode.parentElement
        maxLoop--
    }

    const range = selection?.getRangeAt(0)

    if (range) {
        const selectionContainer = range.commonAncestorContainer
        if (editorContainer.contains(selectionContainer)) {
            return EVENT_TARGET_BOUNDARY.editor
        }
    }

    return EVENT_TARGET_BOUNDARY.outside
}

let transformClock: any = null
let mouseupLock = false
let keydownLock = false

type transformFunc = (e: Event, eventTargetBoundary: EVENT_TARGET_BOUNDARY) => {nextType:TOOLBAR_TYPE, resetPosition:boolean}

const _commandTransform:transformFunc = (e, eventTargetBoundary)=>{
    let nextType = TOOLBAR_TYPE.keep
    let resetPosition = false
    // 转prefix的分支
    if(['mouseup'].includes(e.type)
        && eventTargetBoundary === EVENT_TARGET_BOUNDARY.editor
        && getSelectionType() !== SELECTION_TYPE.range
    ){
        nextType = TOOLBAR_TYPE.prefix
        resetPosition = true
    }
    // 消失的分支
    else if(
        (
            ['mouseup'].includes(e.type) 
            && [EVENT_TARGET_BOUNDARY.outside].includes(eventTargetBoundary)
        ) || ['keydown', 'keyup'].includes(e.type)
    ){
        nextType = TOOLBAR_TYPE.none
    }
    // 重新展示command的分支
    else if(['mouseup'].includes(e.type) 
        && [EVENT_TARGET_BOUNDARY.editor, EVENT_TARGET_BOUNDARY.link].includes(eventTargetBoundary)
        && getSelectionType() === SELECTION_TYPE.range
    ){
        nextType = TOOLBAR_TYPE.command
        resetPosition = true
    }
    return {nextType, resetPosition}
}
const _prefixTransform:transformFunc = (e, eventTargetBoundary)=>{
    let nextType = TOOLBAR_TYPE.keep
    let resetPosition = false
    // 转prefix的分支
    if(['mouseover'].includes(e.type) && eventTargetBoundary === EVENT_TARGET_BOUNDARY.editor){
        if(prefixIsShow()){
        }else{
            nextType = TOOLBAR_TYPE.prefix
            resetPosition = true
        }
    }
    // 消失的分支
    else if(
        (
            ['mouseup'].includes(e.type) 
            && [EVENT_TARGET_BOUNDARY.outside].includes(eventTargetBoundary)
        ) || (
            ['keydown', 'keyup'].includes(e.type)
            && eventTargetBoundary === EVENT_TARGET_BOUNDARY.editor
        )
    ){
        nextType = TOOLBAR_TYPE.none
        // 只有键盘事件需要手动触发，模拟点击一次button
        if(prefixIsShow() && ['keydown', 'keyup'].includes(e.type)){
            hidePrefixPopover()
        }
    }
    // 重新展示command的分支
    else if(['mouseup'].includes(e.type) 
        && [EVENT_TARGET_BOUNDARY.editor, EVENT_TARGET_BOUNDARY.link].includes(eventTargetBoundary)
        && getSelectionType() === SELECTION_TYPE.range
    ){
        nextType = TOOLBAR_TYPE.command
        resetPosition = true
    }
    // 让prefix菜单消失的分支
    else if(
        ['mouseup'].includes(e.type) 
        && eventTargetBoundary === EVENT_TARGET_BOUNDARY.editor 
        && getSelectionType() !== SELECTION_TYPE.range
    ){
        if(prefixIsShow()){
            hidePrefixPopover()
        }
    }
    // 展示link的分支
    else if(['mouseover'].includes(e.type)
        && eventTargetBoundary === EVENT_TARGET_BOUNDARY.link
    ){
        nextType = TOOLBAR_TYPE.link
        resetPosition = true
    }
    return {nextType, resetPosition}
}
const _noneTransform:transformFunc = (e, eventTargetBoundary)=>{
    let nextType = TOOLBAR_TYPE.keep
    let resetPosition = false
    // 转prefix的分支
    if(['mouseover', 'mouseup'].includes(e.type)
        && eventTargetBoundary === EVENT_TARGET_BOUNDARY.editor
    ){
        nextType = TOOLBAR_TYPE.prefix
        resetPosition = true
    }
    // 重新展示command的分支
    else if(['mouseup'].includes(e.type) 
        && [EVENT_TARGET_BOUNDARY.editor, EVENT_TARGET_BOUNDARY.link].includes(eventTargetBoundary)
        && getSelectionType() === SELECTION_TYPE.range
    ){
        nextType = TOOLBAR_TYPE.command
        resetPosition = true
    }
    // 展示link的分支
    else if(['mouseover'].includes(e.type)
        && eventTargetBoundary === EVENT_TARGET_BOUNDARY.link
    ){
        nextType = TOOLBAR_TYPE.link
        resetPosition = true
    }

    return {nextType, resetPosition}
}
const _linkTransform:transformFunc = (e, eventTargetBoundary)=>{
    let nextType = TOOLBAR_TYPE.keep
    let resetPosition = false
    // 转prefix的分支
    if(['mouseup'].includes(e.type)
        && eventTargetBoundary === EVENT_TARGET_BOUNDARY.editor
        && getSelectionType() !== SELECTION_TYPE.range
    ){
        nextType = TOOLBAR_TYPE.prefix
        resetPosition = true
    }
    // 消失的分支
    else if(
        ['mouseup', 'keydown', 'keyup'].includes(e.type) && [EVENT_TARGET_BOUNDARY.outside].includes(eventTargetBoundary)
    ){
        nextType = TOOLBAR_TYPE.none
    }
    // 展示command的分支
    else if(['mouseup'].includes(e.type) 
        && [EVENT_TARGET_BOUNDARY.editor, EVENT_TARGET_BOUNDARY.link].includes(eventTargetBoundary)
        && getSelectionType() === SELECTION_TYPE.range
    ){
        nextType = TOOLBAR_TYPE.command
        resetPosition = true
    }
    return {nextType, resetPosition}
}
const transformMap:{[key in TOOLBAR_TYPE]:transformFunc} = { 
    [TOOLBAR_TYPE.command]: _commandTransform,
    [TOOLBAR_TYPE.prefix]: _prefixTransform,
    [TOOLBAR_TYPE.none]: _noneTransform,
    [TOOLBAR_TYPE.link]: _linkTransform,
    [TOOLBAR_TYPE.keep]: ()=>{return {nextType:TOOLBAR_TYPE.keep, resetPosition:false}}
}

const transform = (e: Event, view: AditorDocView) => {
    if(mouseupLock) return
    if(keydownLock) return
    // 获得基本对象
    const tbHTMLElements = toolbarHTMLElements()
    const editorContainer = document.getElementById(view.rootVid)
    const toolbar = getToolbar()
    if (!editorContainer) {
        return
    }
    if (!toolbar) {
        return
    }

    const eventTargetBoundary = getEventTargetBoundary(e, editorContainer, tbHTMLElements)
    const currentState = stateType()

    // 先根据各种条件生成action 
    let delayTime = 20

    // 根据事件调整delayTime
    if(['mouseover'].includes(e.type) && eventTargetBoundary === EVENT_TARGET_BOUNDARY.outside){
        delayTime = 500
    }
    if(['mouseover'].includes(e.type) && eventTargetBoundary === EVENT_TARGET_BOUNDARY.link){
        delayTime = 600
    }
    if(['mouseup'].includes(e.type)){
        mouseupLock = true
        setTimeout(()=>{
            mouseupLock = false
        }, delayTime)
    }
    if(['keydown'].includes(e.type)){
        keydownLock = true
        setTimeout(()=>{
            keydownLock = false
        },  100)
    }
    
    clearTimeout(transformClock)
    transformClock = setTimeout(()=>{
        // 根据不同状态进入不同判断分支
        let nextType=TOOLBAR_TYPE.keep
        let resetPosition=false
        const transformResult = transformMap[currentState](e, eventTargetBoundary)
        nextType = transformResult.nextType
        resetPosition = transformResult.resetPosition

        // 根据nextType执行show和hide初始化参数
        if(nextType === TOOLBAR_TYPE.keep){
            return
        }else if(nextType === TOOLBAR_TYPE.command){
            view.updateSelection()
            const _vsels = view.docState.sels.selections
            if(_vsels.length == 0){
                return
            }
            vsels = _vsels
            state.attrs = getSelectionAttributes(view.docState, vsels)
        }else if(nextType === TOOLBAR_TYPE.prefix){
            const blockStart = view.docState.sels.getCurDOMBlockStartByNode(e.target as HTMLElement)
            let _vsels:VirtualSelection[] = []
            if(blockStart){
                const blockNode = view.docState.findNodeByPos(blockStart)
                if(blockNode){
                    _vsels = [{
                        start: blockNode.start,
                        end: blockNode.start,
                        startOffset: 0,
                        endOffset: blockNode.length()
                    }]                       

                }else{
                    _vsels = []
                }
            }else{
                _vsels = []
            }
            // TODO: 因为aditor各个组件之间用的margin，可能有空隙，导致getCurDOMBlockStartByNode获取的blockNode不准确;改成padding可以解决.
            // 20240521 jerry1.zhu
            if(_vsels.length == 0){
                return 
            }
            vsels = _vsels
            state.attrs = getSelectionAttributes(view.docState, vsels)
        }else if(nextType === TOOLBAR_TYPE.link){
            const blockStart = (e?.target as HTMLElement)?.getAttribute('selstart')
            let _vsels:VirtualSelection[] = []
            if(blockStart){
                const blockNode = view.docState.findNodeByPos(parseInt(blockStart))
                if(blockNode){
                    _vsels = [{
                        start: blockNode.start,
                        end: blockNode.start,
                        startOffset: 0,
                        endOffset: blockNode.length()
                    }]          
                }else{
                    _vsels = []
                }
            }else{
                _vsels = []
            }
            if(_vsels.length == 0){
                return 
            }
            vsels = _vsels
            state.attrs = getSelectionAttributes(view.docState, vsels)
        }

        if(nextType === TOOLBAR_TYPE.none){
            hide(toolbar)
        }else{
            show(e, view, toolbar, editorContainer, resetPosition, nextType)
        }
    }
    , delayTime)
    
}

const show = (e: Event, view: AditorDocView, toolbar: HTMLElement, container: HTMLElement, resetPosition: boolean, nextType: TOOLBAR_TYPE) => {

    if (resetPosition) {
        let _getSelectionPositionFunc = _getSelectionPosition
        // if the selection is single node, show prefix toolbar
        if (nextType === TOOLBAR_TYPE.prefix) {
            _getSelectionPositionFunc = _getSelectionPositionPrefix
        }else if(nextType === TOOLBAR_TYPE.link){
            _getSelectionPositionFunc = _getSelectionPositionLink
        }
        const position = _getSelectionPositionFunc(e as MouseEvent, container.parentElement as HTMLElement)

        if (position == null) {
            return
        }
        _setPosition(position.left, position.top)
    }
    // set next type
    setStateType(nextType)

    // if the toolbar is already in the container, need to remove it first
    if (state.displayState === TOOLBAR_DISPLAY_STATE.show) {
        setDisplayState(TOOLBAR_DISPLAY_STATE.hide)
    }

    // if not command,hide color popover
    if(nextType != TOOLBAR_TYPE.command){
        hideCommandPopover()
    }
    if(nextType != TOOLBAR_TYPE.prefix){
        hidePrefixPopover()
    }

    // use nextTick to make sure the toolbar is in the container
    nextTick(() => {
        _hookElement(toolbar, container)
        // _createMask()
        setDisplayState(TOOLBAR_DISPLAY_STATE.show)
    })
}

const hide = (toolbar: HTMLElement) => {
    hideCommandPopover()
    hidePrefixPopover()
    _hookElement(toolbar, document.body)
    _setPosition(-10000, -10000)
    // _removeMask()
    setDisplayState(TOOLBAR_DISPLAY_STATE.hide)
    setStateType(TOOLBAR_TYPE.none)
}

const hideCommandPopover = () => {
    state.colorVisible = false
}

const hidePrefixPopover = () => {
    state.prefixMenuVisible = false
}

let masks: HTMLElement[] = [];

/** 
 * The mask selection may overlap, and the current method of judging based on the independent position information of each is not perfect.
 * You can use the maximum common area method to construct an independent mask for each line
 * @description create mask when input url; it's a trick to simulate the selected area effect
**/
const _createMask = () => {
    const view = activeView()
    if (!view) return;

    const container = document.getElementById(view.docState.root.virtualId as string)?.parentElement as HTMLElement
    masks.forEach(mask => container.removeChild(mask));
    masks = [];

    const selection = window.getSelection();
    if (!selection) return;
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();
    const parentRect = (container as HTMLElement).getBoundingClientRect();

    for (const rect of rects) {
        // check if there is already a mask in the same position
        const existingMask = masks.find(mask =>
            parseInt(mask.style.top) === parseInt(`${rect.top - parentRect.top - 3}px`) &&
            parseInt(mask.style.left) === parseInt(`${rect.left - parentRect.left}px`) &&
            parseInt(mask.style.width) === parseInt(`${rect.width}px`) &&
            parseInt(mask.style.height) === parseInt(`${rect.height + 6}px`)
        );

        // if there is already a mask in the same position, skip creating a new mask
        if (existingMask) continue;

        const mask = document.createElement('div');
        mask.style.position = 'absolute';
        mask.style.top = `${rect.top - parentRect.top - 3}px`;
        mask.style.left = `${rect.left - parentRect.left}px`;
        mask.style.width = `${rect.width}px`;
        mask.style.height = `${rect.height + 6}px`;
        mask.style.backgroundColor = 'rgba(200, 200, 200, 0.5)'; // half transparent gray
        container.appendChild(mask);
        masks.push(mask);
    }
}

const _removeMask = () => {
    const view = activeView()
    if (!view) return;
    const container = document.getElementById(view.docState.root.virtualId as string)?.parentElement as HTMLElement
    masks.forEach(mask => container.removeChild(mask));
    masks = [];
}

const eventListener = {
    click: (e: Event) => {
        // const view = activeView()
        // if (view instanceof AditorDocView) {
        //     transform(e, view)
        // }
    }
    // , selectionchange: (e: Event) => {
    //     console.log('selectionchange', e)
    // }
    , mousedown: (e: Event) => {
        // const view = activeView()
        // if (view instanceof AditorDocView) {
        //     transform(e, view)
        // }
    }
    , mouseup: (e: Event) => {
        // use delay to prevent mouseover event clearTimeout immediately after mouseup event unlock
        const view = activeView()
        if (view instanceof AditorDocView) {
            transform(e, view)
        }
    }
    // , mousemove: (e: Event) => {
    //     console.log('mousemove', e)
    // }
    , mouseover: (e: Event) => {
        const view = activeView()
        if (view instanceof AditorDocView) {
            transform(e, view)
        }
    }
    // , mouseout: (e: Event) => {
    //     console.log('mouseout', e)
    // }
    // , mouseenter: (e: Event) => {
    //     console.log('mouseenter', e)
    // }
    // , mouseleave: (e: Event) => {
    //     console.log('mouseleave', e)
    // }
    // , contextmenu: (e: Event) => {
    //     console.log('contextmenu', e)
    // }
    // , dblclick: (e: Event) => {
    //     console.log('dblclick', e)
    // }
    // , focus: (e: Event) => {
    //     console.log('focus', e)
    // }
    // , blur: (e: Event) => {
    //     console.log('blur', e)
    // }
    , keydown: (e: Event) => {
        const view = activeView()
        if (view instanceof AditorDocView) {
            transform(e, view)
        }
    }
    // , keypress: (e: Event) => {
    //     console.log('keypress', e)
    // }
    // , keyup: (e: Event) => {
    //     console.log('keyup', e)
    // }
    // , input: (e: Event) => {
    //     console.log('input', e)
    // }
    // , change: (e: Event) => {
    //     console.log('change', e)
    // }
    // , paste: (e: Event) => {
    //     console.log('paste', e)
    // }
    // , cut: (e: Event) => {
    //     console.log('cut', e)
    // }
    // , copy: (e: Event) => {
    //     console.log('copy', e)
    // }
    // , drag: (e: Event) => {
    //     console.log('drag', e)
    // }
    // , dragstart: (e: Event) => {
    //     console.log('dragstart', e)
    // }
}


export default {
    init
    , beforeEnter
    , afterEnter
    , beforeLeave
    , afterLeave

    , state: readonly(state)
    , commands: commands
    , fontColor
    , backgroundColor
    , colorCommands: defaultColorCommands
    , backgroundColorCommands: defaultBackgroundColorCommands
    , setStateType
    , setLinkValue
    , executeSetLink
    , clickColorButton
    , clickPrefixButton
}