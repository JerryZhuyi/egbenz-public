import { h, toRaw, ref} from 'vue'
import { AditorDocView, AditorNode, VirtualSelection, ANodeType
    , ViewEventEnum, setDOMSelection, createAditorNode 
    , StyleNameEnum
} from 'vue-aditor'
import { aiAssistantStates } from './AIAssistantStates'

import {
    TextBold16Regular as BoldIcon
    , TextStrikethrough16Regular as StrikethroughIcon
    , TextItalic16Regular as ItalicIcon
    , TextUnderline16Regular as UnderlineIcon
    , TextEditStyle20Filled as StyleIcon
    , Add24Filled as AddIcon
    , GridDots20Filled as SettingIcon

    , TextT24Filled as ParagraphIcon
    , TextEffects20Filled as ColorSetIcon
    , TextColor24Filled as TextColorIcon
    , TextField20Filled as BackgroundColorIcon
    , TextHeader120Filled as H1Icon
    , TextHeader220Filled as H2Icon
    , TextHeader320Filled as H3Icon
    , Comma24Filled as QuoteIcon
    , TextAlignLeft20Filled as AlignLeftIcon
    , TextAlignCenter20Filled as AlignCenterIcon
    , TextAlignRight20Filled as AlignRightIcon
    , Delete24Regular as DeleteIcon

    , Link16Regular as LinkIcon
    , Translate16Regular as TranslateIcon
    , Mic16Filled as Txt2AudioIcon
    , Image16Filled as Txt2ImgIcon
    , MathFormula24Filled as MathIcon
    , DrawShape24Filled as AIDrawIcon
} from '@vicons/fluent'
import { aIAssistantAsk, truncateMsg, cacheAskPrompt, AITalkSessionList } from './AIAssistantAsk'
import { aiAsk as oldAIAsk } from './aditor_extensions/aditorAIChatUtils.ts';

import { globalState } from '../global-state'

export const aiStates = ref({
    isHide: true,
    width: '0px',
    height: '0px',
    showContent: false,
    showContentColorSet: false,
    showContentLink: false,
    showContentAITalk: false,
    loading: false,
    linkValue: "",
    aiInput: "",
    isAskAI: false,
})

export const aiCache:{
    view: AditorDocView | null,
    lastPosition: {left:number, top:number} | null,
    actionParamsCache: ActionParams | null
} = {
    view: null,
    lastPosition: null,
    actionParamsCache: null
}

export const aiTalkSessionList = new AITalkSessionList()

export const aiFuncs = ref<AIFunctionInterface[]>([])

export const aiAssistantRef = ref<HTMLElement|null>(null)

export const aiTalkContentRef = ref<HTMLElement|null>(null)

// 设置监听触发延迟1s
let showTimer: any = null;
let selHookTimer: any = null;

// 更改选区按钮
// ref结构{id:string, name:string}[]

const aiFn = (e:Event, container:HTMLElement, view: AditorDocView, actionParams: ActionParams)=>{
    const _position = getSelectionPosition(e, container)
    const position = _position ? _position : getFocusElementPosition(e, container, actionParams.trigger_target as HTMLElement)
    if (!position) return

    // 设置位置
    aiAssistantRef.value!.style.left = position.left + 'px'
    aiAssistantRef.value!.style.top = position.top + 'px'

    hookElement(aiAssistantRef.value!, container)

    let samePosition = true

    if(!aiCache.lastPosition){
        samePosition = false
    }else{
        samePosition = aiCache.lastPosition.left === position.left && aiCache.lastPosition.top === position.top
    }
    
    aiCache.lastPosition = Object.assign({}, position)
    aiStates.value.isHide = false

}

export const selHook = (e: Event, getAditorView: ()=>AditorDocView|null) => {
    clearTimeout(selHookTimer)
    // 获取选区基本信息，基本信息没有的话，直接隐藏
    const view = getAditorView()
    aiCache.view = view
    if (!view) return 
    const editorContainer = document.getElementById(view.rootVid)
    if (!editorContainer) return 
    const container = editorContainer?.parentElement
    if (!container) return 

    selHookTimer = setTimeout(()=>{
        const actionParams = show(e, container, view)
        if(actionParams.refreshSelection) aiFuncs.value = generateAiFns(view, actionParams)
        if (!actionParams.action) return

        else if (actionParams.show){
            hideAllContent()
            clearTimeout(showTimer)
            if(actionParams.timeout === 0){
                aiFn(e, container, view, actionParams)
            }else{
                showTimer = setTimeout(()=>{
                    aiFn(e, container, view, actionParams)
                }, actionParams.timeout)
            }
        }else{
            hide(e, actionParams.timeout)
        }
    }, 100)

}

const show = (e: Event, container:HTMLElement, view: AditorDocView):ActionParams=>{
    const defaultReturn = new ActionParams()
    let onWhere = getEventOnWhere(e)
    let onAditor = onWhere === 'aditor'
    let onAIAssistant = onWhere === 'aiAssistant'
    const selections = view?.docState?.sels.selections
    if (!selections || selections.length != 1){
        // 如果没有selection，则手动调用这里的Selection修正 onWhere
        if(!onAIAssistant){
            return defaultReturn
        }else{
            defaultReturn.action = false
            return defaultReturn
        }
    }

    // 判断当前选区对象，如果是扩展组件，只有下面的扩展组件支持，非扩展组件判断是否单选
    const returnParams = new ActionParams()
    const selection = selections[0]
    returnParams.selection = Object.assign({}, selection)
    let selected = false
    let selectSingle = false
    // 先判断和上一次sel是否是同个位置
    let sameSelection = true
    if(!aiCache.actionParamsCache){
        sameSelection = false
    }else{
        sameSelection = deepCompare(selection, aiCache.actionParamsCache.lastSelection)
    }
    returnParams.selectChange = sameSelection
    returnParams.lastSelection = Object.assign({}, aiCache.actionParamsCache?.selection)
    if(selection?.extend){
        if(['aditorCode', 'aditorKatex', 'aditorCanvas'].includes(selection?.extend?.name)){
            if(selection?.extend?.data?.selected !== undefined && selection?.extend?.data?.selected !== null){
                selected = selection?.extend?.data?.selected 
            }else{
                selected = true
            }
            selectSingle = selection?.extend.single
            returnParams.selectExtend = true
            returnParams.selectExtendName = selection?.extend.name
            returnParams.inParagraphPosition = getInParagraphPosition(selection?.extend.start, selection?.extend.end, selection?.extend.total)
        }else{
            selected = false
        }
    }else{
        selected = true
        if(selection?.start === selection?.end && selection?.startOffset === selection?.endOffset){
            selectSingle = true
        }else{
            selectSingle = false
        }
        returnParams.inParagraphPosition = getInAditorNodePosition(view, selection)
    }
    returnParams.selectSingle = selectSingle

    const etype = e.type
    // 隐藏下，点击到编辑器上，获取到选区，选区为单选，1000ms后展示
    if(aiStates.value.isHide && etype === 'mouseup' && !onAIAssistant && onAditor && selected && selectSingle){
        returnParams.show = true
        returnParams.refreshSelection = true
        returnParams.timeout = 600
    }
    // 隐藏下，点击到编辑器上，获取到选区，跨选区，10ms后展示
    else if(aiStates.value.isHide && etype === 'mouseup' && !onAIAssistant && onAditor && selected && !selectSingle){
        returnParams.show = true
        returnParams.refreshSelection = true
        returnParams.timeout = 10
    }
    // 展示下，点击到编辑器上，获取到选区，选区为单选
    else if(!aiStates.value.isHide && etype === 'mouseup' && !onAIAssistant && onAditor && selected && selectSingle){
        returnParams.show = false
        returnParams.timeout = 0
    }
    // 展示下，点击到编辑器上，获取到选区，跨选区，立即切换
    else if(!aiStates.value.isHide && etype === 'mouseup' && !onAIAssistant && onAditor && selected && !selectSingle){
        returnParams.show = true
        returnParams.refreshSelection = true
        returnParams.timeout = 0
    }
    // 隐藏下，输入到编辑器上，获取到选区，选区为单选，1000ms后展示
    else if(aiStates.value.isHide && ['keyup', 'selectionchange'].includes(etype) && !onAIAssistant && onAditor && selected && selectSingle){
        returnParams.show = true
        returnParams.refreshSelection = true
        returnParams.timeout = 600
    }
    // 展示下，输入到编辑器上，立即隐藏
    else if(!aiStates.value.isHide && etype === 'keyup' && !onAIAssistant && onAditor){
        returnParams.show = false
        returnParams.timeout = 0
    }
    // 如果事件在ai-assistant 无操作
    else if(onAIAssistant){
        returnParams.action = false
        returnParams.show = true
        returnParams.refreshSelection = true
        returnParams.timeout = 0
    }
    // 其他情况立即隐藏
    else{
        returnParams.show = false
        returnParams.timeout = 0
    }

    // 获取选区属性
    const selParams = getSelectionParams(view, selection)
    returnParams.selAttrs = selParams.selAttrs
    returnParams.selText = selParams.selText
    returnParams.trigger_target = etype === 'selectionchange' ? (getSelectionDOM() || document.body) : e.target as HTMLElement | Node
    
    aiCache.actionParamsCache = Object.assign({}, returnParams)
    return returnParams
}

const hide = (e:Event, timeout: number=0)=>{
    hideAllContent()
    clearTimeout(showTimer)
    if(timeout === 0){
        aiStates.value.isHide = true
    }else{
        showTimer = setTimeout(()=>{
            aiStates.value.isHide = true
        }, timeout)
    }
}

const getEventOnWhere = (e: Event):'aditor'|'aiAssistant'|'out' =>{
    let target = e.target
    if(e.type === 'selectionchange'){
        target = getSelectionDOM()
    }
    if(!target) return 'out'

    let maxLoop = 1000
    let element:HTMLElement| EventTarget |null = target
    // 非body
    while (element && maxLoop-- > 0 && element !== document.body) {
        if ((element as HTMLElement).hasAttribute && (element as HTMLElement).hasAttribute('vid')) {
            return 'aditor';
        }else if((element as HTMLElement).hasAttribute && (element as HTMLElement).hasAttribute('ai-ass-juge')){
            return 'aiAssistant'
        }
        element = (element as HTMLElement)?.parentElement;
    }
    return 'out'
}

// 获取当前光标所在元素
const getSelectionDOM = ():Node | null => {
    const selection = document.getSelection();
    if (selection && selection.anchorNode) {
        return selection.anchorNode.nodeType === Node.TEXT_NODE
        ? selection.anchorNode.parentNode
        : selection.anchorNode;
    }else{
        return null
    }
}

///////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////// 以上为AI助手Show 或者 Hook逻辑 //////////////////////////// //
///////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////


/**
 * Get selection position
 * this function is used to get the position of the selection end node
 * the end node must be a text node, otherwise it will return null
 * @param e 
 * @param targetElement: the Editor root element
 * @returns {top:number, left:number} | null
 */
const getSelectionPosition = (e: Event, targetElement: HTMLElement): { top: number, left: number } | null => {
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
    const filterClientRanges:any[] = []
    // fix bug double click bug:
    // 对于三击全选触发事件，如果选中了下一行的开头，即endOffset为0，并且开始容器不等于结束容器，此时需要放弃最后一个rect
    if (endOffset == 0 && startNode != endNode) {
        for (let i = 0; i < allClientRanges.length - 1; i++) {
            filterClientRanges.push(allClientRanges[i])
        }
    }else{
        filterClientRanges.push(...allClientRanges)
    }
    let lastRect = isFrontToBack ? filterClientRanges[filterClientRanges.length - 1] : filterClientRanges[0]
    const offsetX = isFrontToBack ? lastRect?.width : 0
    const parentNodeOffset = _getClientOffset(targetElement)

    if (lastRect == null) {
        // 使用startNode
        console.warn("Can't get lastRect, use startNode instead")
        return null
    }

    // 文本高度偏移
    const textOffsetTop = 30
    // 获取aiAssistantRef.value的宽度，转成数字
    let aiAssistantWidth = getAiAssistantProbWidth()

    // 最后计算各种偏移位置
    let toolbalTop = endNodeOffset.top + Math.abs(endNodeBrowserOffset.top - lastRect.top) - textOffsetTop
    let toolbalLeft = lastRect.left + offsetX - parentNodeOffset.left - aiAssistantWidth/2

    // 获取body的宽度
    const bodyWidth = globalState.screenWidth-globalState.asideWidth
    if (toolbalLeft + aiAssistantWidth> bodyWidth) {
        toolbalLeft = bodyWidth - aiAssistantWidth
    } else if (toolbalLeft < 0) {
        toolbalLeft = 0
    }
    

    return {top: toolbalTop, left:toolbalLeft}
    
}

const getFocusElementPosition = (e: Event, _targetElement: HTMLElement, _focusElement: HTMLElement): { top: number, left: number } | null => {
    const _getClientOffset = (element: HTMLElement) => {
        let top = 0, left = 0;
        while (element) {
            top += element.offsetTop || 0;
            left += element.offsetLeft || 0;
            element = element.offsetParent as HTMLElement;
        }
        return { top: top, left: left };
    }
    // 获取e.target，是否是input或者textarea
    const target = e.target as HTMLElement
    let targetElement = _targetElement
    let focusElement = _focusElement
    let heightFix = 0
    let widthFix = 0

    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        focusElement = target
        if (focusElement.tagName === 'INPUT' || focusElement.tagName === 'TEXTAREA') {
            // 获取focusElement的高度
            const focusElementHeight = focusElement.offsetHeight
            if (focusElementHeight) {
                heightFix = focusElementHeight
            }
        } 
    }

    
    const parentNodeOffset = _getClientOffset(targetElement)
    const focusElementOffset = _getClientOffset(focusElement)
    if (focusElement == null) return null

    let aiAssistantWidth = getAiAssistantProbWidth()


    // 获取focusElement的高度
    const focusElementHeight = focusElement.offsetHeight
    const focusElementWidth = focusElement.offsetWidth
    let top = focusElementOffset.top - parentNodeOffset.top + focusElementHeight + 10
    let left = focusElementOffset.left - parentNodeOffset.left 

    // 获取body的宽度
    const bodyWidth = globalState.screenWidth-globalState.asideWidth
    if (left + aiAssistantWidth> bodyWidth) {
        left = bodyWidth - aiAssistantWidth
    } else if (left < 0) {
        left = 0
    }
        

    return { top: top, left: left }

}

const getAiAssistantProbWidth = ()=>{
    if(aiFuncs.value && aiFuncs.value.length > 0){
        return aiFuncs.value.length * 62 + 80
    }else{
        return 300
    }
}

const hookElement = (targetEl: Element, Container: Element) => {
    // 如果已经挂载了，那么不需要再次挂载
    if (targetEl.parentElement === Container) return
    
    targetEl.parentNode?.removeChild(targetEl)
    Container.appendChild(targetEl)
}

function deepCompare(obj1:any, obj2:any) {
    // Check if both objects are of the same type
    if (typeof obj1 !== typeof obj2) {
        return false;
    }

    // Check if both objects are null or undefined
    if (obj1 === null || obj1 === undefined || obj2 === null || obj2 === undefined) {
        return obj1 === obj2;
    }

    // Check if both objects are primitive types
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
        return obj1 === obj2;
    }

    // Check if both objects have the same number of properties
    if (Object.keys(obj1).length !== Object.keys(obj2).length) {
        return false;
    }

    // Recursively compare each property
    for (let key in obj1) {
        if (!deepCompare(obj1[key], obj2[key])) {
            return false;
        }
    }

    return true;
}

interface SelParams {
    selAttrs: SelAttrs,
    selText: SelTextInterface
}

interface SelAttrs {
    title: '正文' | '一级' | '二级' | '三级',
    alignment: '左对齐' | '居中对齐' | '右对齐' ,
    fontWeight: boolean,
    lineThrough: boolean,
    italic: boolean,
    underline: boolean,
    linkNum: number,
    linkValue: string,
    color: keyof typeof TEXT_COLOR,
    backgroundColor: keyof typeof BACKGROUND_COLOR
}

interface SelTextInterface {
    forwardText: string,
    selectedText: string,
    backwardText: string,
    selectedLineText: string,
    forwardNodesName: string[],
    selectionNodesName: string[],
    backwardNodesName: string[],
    selectedLineNodeName: string[]
}

type InParagraphPosType = 'start' | 'middle' | 'end' | 'start2middle' | 'middle2end' | 'start2end' | 'middle2middle'

function getSelectionParams(view: AditorDocView, vsel: VirtualSelection): SelParams{
    // text参数
    const cacheTextLength = 1000
    const globalPos = view.docState.nodesel2globalpos(view.docState.vsels2Nodesels([vsel])[0])
    const selText:SelTextInterface = {
        forwardText: "",
        selectedText: "",
        backwardText: "",
        selectedLineText: "",
        forwardNodesName: [],
        selectionNodesName: [],
        backwardNodesName: [],
        selectedLineNodeName: []
    }
    const forwardPos = {
        start: globalPos.start - cacheTextLength > 0 ? globalPos.start - cacheTextLength : 1,
        end: globalPos.start
    }
    const backwardPos = {
        start: globalPos.end,
        end: globalPos.end + cacheTextLength
    }
    //获取当前选中节点在根节点的位置,也就是root的直接子节点
    const rootIndex = view.docState.findNodeRootIndexByPos(globalPos.start)
    const rootDirectChildren = view.docState.root.children[rootIndex] || {start: 0, end: 0}
    const linePos = {
        start: rootDirectChildren.start,
        end: rootDirectChildren.end
    }

    // attrs参数
    const selAttrs:SelAttrs = {
        title: '正文',
        alignment: '左对齐',
        fontWeight: false,
        lineThrough: false,
        italic: false,
        underline: false,
        linkNum: 0,
        linkValue: '',
        color: '黑色',
        backgroundColor: '透明'
    }

    const titleList:string[] = []
    const alignList:string[] = []
    const fontWeightList:boolean[] = []
    const textUnderlineList:boolean[] = []
    const textLineTroughList:boolean[] = []
    const itailcList:boolean[] = []
    const colorList:string[] = []
    const backgroundColorList:string[] = []
    const linkList: string[] = []

    const selParams = {
        titleList
        , alignList
        , fontWeightList
        , textUnderlineList
        , textLineTroughList
        , itailcList
        , colorList
        , backgroundColorList
        , linkList
    }

    // 核心递归
    view.docState.traverseNodeByPos(forwardPos.start, backwardPos.end, (node, parentNode) => {
        getSelectionText(view, vsel, selText, forwardPos, backwardPos, globalPos, linePos, node)
        getSelectionAttributes(node, globalPos, selParams)
    })

    //text后续处理，去掉首尾的换行符
    selText.forwardText = selText.forwardText.trim()
    selText.selectedText = selText.selectedText.trim()
    selText.backwardText = selText.backwardText.trim()
    selText.selectedLineText = selText.selectedLineText.trim()

    //attrs后续处理
    const typeListSet = new Set(titleList)
    const alignListSet = new Set(alignList)
    const colorSet = new Set(colorList)
    const backgroundColorSet = new Set(backgroundColorList)
    const linkListSet = new Set(linkList)

    if(typeListSet.size == 1){
        selAttrs.title = titleList[0] == '1' ? '一级' : titleList[0] == '2' ? '二级' : titleList[0] == '3' ? '三级' : '正文'
    }

    if(alignListSet.size == 1){
        selAttrs.alignment = alignList[0] == 'right' ? '右对齐' : alignList[0] == 'center' ? '居中对齐' : '左对齐'
    }

    selAttrs.linkNum = linkListSet.size
    selAttrs.linkValue = linkListSet.size == 1 ? linkList[0] : ''
    setLinkValue(selAttrs.linkValue)
    clearAIMsg()
    // if one true    
    selAttrs.fontWeight = fontWeightList.includes(true)
    selAttrs.underline = textUnderlineList.includes(true)
    selAttrs.lineThrough = textLineTroughList.includes(true)
    selAttrs.italic = itailcList.includes(true)

    if(colorSet.size == 1){
        // if color is one of TEXT_COLOR.value
        const color = colorList[0]
        const colorKey = Object.keys(TEXT_COLOR).find(key => TEXT_COLOR[key as keyof typeof TEXT_COLOR].replace(/\s/g, '') == color.replace(/\s/g, '')) as keyof typeof TEXT_COLOR
        selAttrs.color = colorKey ? colorKey : '黑色'
    }

    if(backgroundColorSet.size == 1){
        // if color is one of TEXT_COLOR.value
        const color = backgroundColorList[0]
        const colorKey = Object.keys(BACKGROUND_COLOR).find(key => BACKGROUND_COLOR[key as keyof typeof BACKGROUND_COLOR].replace(/\s/g, '') == color.replace(/\s/g, '')) as keyof typeof BACKGROUND_COLOR
        selAttrs.backgroundColor = colorKey ? colorKey : '透明'
    }

    return {selText, selAttrs}
}

function getSelectionText(view: AditorDocView
    , vsel: VirtualSelection
    , selText: SelTextInterface
    , forwardPos: {start:number, end:number}
    , backwardPos: {start:number, end:number}
    , globalPos: {start:number, end:number}
    , linePos: {start:number, end:number}
    , node: AditorNode
){
    // 如果节点在vsels内，那么将其文本加入到text中
    if(!(node.end < forwardPos.start && node.start > backwardPos.end)){
        const vueComponent = view.getVueComponent(node.virtualId)
        if(vueComponent && vueComponent.exposed && vueComponent.exposed.getSelectionText){
            const textParams = vueComponent.exposed.getSelectionText()
            // 修正aditorKatex失焦时selection不消失的问题
            if(node.start == globalPos.start || node.end == globalPos.end){
                selText.selectedText += textParams.selectedText ? textParams.selectedText : ""
                selText.forwardText += textParams.forwardText ? textParams.forwardText : ""
                selText.backwardText += textParams.backwardText ? textParams.backwardText : ""
                selText.selectionNodesName.push(node.name)
            }else if(node.end > globalPos.end){
                selText.backwardText += textParams.forwardText
                selText.backwardText += textParams.selectedText
                selText.backwardText += textParams.backwardText
                selText.backwardNodesName.push(node.name)
            }else{
                selText.forwardText += textParams.forwardText
                selText.forwardText += textParams.selectedText
                selText.forwardText += textParams.backwardText
                selText.forwardNodesName.push(node.name)
            }

            if(node.start >= linePos.start && node.end <= linePos.end){
                selText.selectedLineText += textParams.forwardText + textParams.selectedText + textParams.backwardText
                selText.selectedLineNodeName.push(node.name)
            }
            
        }else{
            if(!(node.end < globalPos.start || node.start > globalPos.end)){
                selText.selectedText += node.getTextByRange(globalPos.start, globalPos.end)
                selText.selectionNodesName.push(node.name)
            }

            if(!(node.end < forwardPos.start || node.start > forwardPos.end)){
                selText.forwardText += node.getTextByRange(forwardPos.start, forwardPos.end)
                selText.forwardNodesName.push(node.name)
            }

            if(!(node.end < backwardPos.start || node.start > backwardPos.end)){
                selText.backwardText += node.getTextByRange(backwardPos.start, backwardPos.end)
                selText.backwardNodesName.push(node.name)
            }

            if(node.start >= linePos.start && node.end <= linePos.end){
                selText.selectedLineText += node.getTextByRange(linePos.start, linePos.end)
                selText.selectedLineNodeName.push(node.name)
            }
        }
    }
}

function getSelectionAttributes(node: AditorNode, globalPos:{start:number, end:number}, selParams:any){
    const {
        titleList
        , alignList
        , fontWeightList
        , textUnderlineList
        , textLineTroughList
        , itailcList
        , colorList
        , backgroundColorList
        , linkList
    } = selParams

    if(!(node.end < globalPos.start || node.start > globalPos.end)){
        if(node.type === ANodeType.Child){
            node.name === 'aditorTitleParagraph' && node.data?.level ? titleList.push(node.data.level) : undefined
            node.originStyle['textAlign'] ? alignList.push(node.originStyle['textAlign']) : undefined
        }else if(node.type === ANodeType.Leaf){
            typeof node.originStyle['fontWeight'] == 'boolean' ? fontWeightList.push(node.originStyle['fontWeight']) : undefined
            typeof node.originStyle['underline'] == 'boolean' ? textUnderlineList.push(node.originStyle['underline']) : undefined
            typeof node.originStyle['lineThrough'] == 'boolean' ? textLineTroughList.push(node.originStyle['lineThrough']) : undefined
            typeof node.originStyle['fontStyle'] == 'boolean' ? itailcList.push(node.originStyle['fontStyle']) : undefined
            node.originStyle['color'] ? colorList.push(node.originStyle['color']) : undefined
            node.originStyle['backgroundColor'] ? backgroundColorList.push(node.originStyle['backgroundColor']) : undefined
            node.name === 'aditorLink' ? linkList.push(node.data?.href) : undefined
        }else{
            console.warn('unknow node type')
        }
    }
}

function getInParagraphPosition(start:number, end:number, total:number): InParagraphPosType{
    if(start === end && (total === 0 || start === 0)){
        return 'start'
    }else if(start === 0 && end === total){
        return 'start2end'
    }else if(start === 0 && end < total){
        return 'start2middle'
    }else if(start > 0 && end === start && end < total){
        return 'middle'
    }else if(start > 0 && end > start && end < total){
        return 'middle2middle'
    }else if(start > 0 && end != start && end === total){
        return 'middle2end'
    }else if(start > 0 && end === start && end === total){
        return 'end'
    }else{
        return 'middle'
    }       
}

function getInAditorNodePosition(view:AditorDocView, vsel:VirtualSelection): InParagraphPosType{
    const globalPos = view.docState.nodesel2globalpos(view.docState.vsels2Nodesels([vsel])[0])
    const startNode = view.docState.findNodeByPos(globalPos.start)
    const endNode = view.docState.findNodeByPos(globalPos.end)
    if(startNode == null || endNode == null){
        return 'middle'
    }else{
        if(globalPos.start === globalPos.end && (startNode.length() === 0 || (globalPos.start - startNode.start) === 0)){
            return 'start'
        }else if((globalPos.start - startNode.start === 0) && (globalPos.end - endNode.start === endNode.length())){
            return 'start2end'
        }else if((globalPos.start - startNode.start === 0) && (globalPos.end - endNode.start < endNode.length())){
            return 'start2middle'
        }else if((globalPos.start - startNode.start > 0) && globalPos.start === globalPos.end && globalPos.end - endNode.start < endNode.length()){
            return 'middle'
        }else if((globalPos.start - startNode.start > 0) && globalPos.start <= globalPos.end && globalPos.end - endNode.start < endNode.length()){
            return 'middle2middle'
        }else if((globalPos.start - startNode.start > 0) && globalPos.start !== globalPos.end && globalPos.end - endNode.start === endNode.length()){
            return 'middle2end'
        }else if((globalPos.start - startNode.start > 0) && globalPos.end - endNode.start === endNode.length()){
            return 'end'
        }else{
            return 'middle'
        }
    }

}

export class ActionParams{
    show: boolean = false
    trigger_target: HTMLElement | Node | null = null
    timeout: number = 0
    action: boolean = true
    refreshSelection: boolean = false
    selection: VirtualSelection | null = null
    lastSelection: VirtualSelection | null = null
    selectSingle: boolean = true
    selectChange: boolean = false
    selectExtend: boolean = false
    selectExtendName: string = "default"
    // 在段落的位置
    inParagraphPosition: InParagraphPosType = 'middle'
    selText!: SelTextInterface 
    selAttrs!: SelAttrs
}

export interface AIFunctionInterface{
    id: string | number | StyleName,
    name: string,
    group: 'ai' | 'tool',
    prompt: string,
    click: ((e:Event, item:AIFunctionInterface) => void) | undefined,
    children: AIFunctionInterface[],
    icon: any,
    highlight: boolean,
    value: string | boolean | number | undefined
}

function makeAiFunction(id: string|number
    , name:string
    , group: 'ai' | 'tool'='ai'
    , prompt: string=''
    , click: ((e:Event, item:AIFunctionInterface) => void) | undefined = undefined
    , children: AIFunctionInterface[]=[]
    , icon: any = undefined
    , highlight: boolean = false
    , value: string | boolean | number | undefined = undefined
): AIFunctionInterface{
    return {
        id: id,
        name: name,
        group: group,
        prompt: prompt,
        click: click,
        children: children,
        icon: icon ? h(icon) : null,
        highlight: highlight,
        value: value
    }
}

function aiAsk(e:Event, view:AditorDocView, actionParams: ActionParams, item: AIFunctionInterface){
    if(getIsAskAI()){
        return
    }

    aiTalkSessionList.newSession()
    showContentAITalk(e, view, actionParams, item)
    if(item.id === 'talk'){
        cacheAskPrompt(actionParams.selText.selectedText)
    }else{
        aIAssistantAsk(item.prompt, aiTalkSessionList)
    }
}

function insertBlock(e:Event, view:AditorDocView, actionParams: ActionParams, item:AIFunctionInterface){
    const value = item.value
    let parentNode: AditorNode | null = null
    if (!actionParams.selection) return

    const childNode = createAditorNode(value as string, {}, {})
    if(!childNode){
        return 
    }
    if(childNode.type === ANodeType.Leaf){
        parentNode = createAditorNode('aditorParagraph', {}, {})
        parentNode.addChild(childNode)
    }else{
        parentNode = childNode
        const innerChild = createAditorNode('aditorText', {}, {})
        parentNode.addChild(innerChild)
    }

    const vsels = [actionParams.selection]
    const adjustVsels:VirtualSelection[] = []
    vsels.forEach(vsel => {
        const startIndex = view.docState.findNodeRootIndexByPos(vsel.end)
        const endNode = view.docState.root.children[startIndex].dfsDeepestRightEndNode()
        if(startIndex !== -1){
            adjustVsels.push({
                start: endNode.end,
                end: endNode.end,
                startOffset: endNode.length(),
                endOffset: endNode.length()
            })
        }
    })
    view.dispatchViewEvent(new Event('keyup'), ViewEventEnum.INSERT_NODES_SELECTIONS, adjustVsels, view.docState, { nodeList: [parentNode] });
}

function updateStyle(e:Event, view:AditorDocView, actionParams: ActionParams, _item:AIFunctionInterface){
    hideAllContent()
    const item = toRaw(_item)

    if(!actionParams.selection) return
    let value = item.value
    const key = toKebabCase(item.id as string)
    if(value === undefined || value === null) return 

    // if 'setSelection' in params
    let styleParams: {key: StyleNameEnum, value: string|boolean}
    let callback
    if(key === 'font-weight'){
        styleParams = {key: StyleNameEnum.fontWeight, value: value as boolean}
    }else if(key === 'underline'){
        styleParams = {key: StyleNameEnum.underline, value: value as boolean}
    }else if(key === 'line-through'){
        styleParams = {key: StyleNameEnum.lineThrough, value: value as boolean}
    }else if(key === 'italic'){
        styleParams = {key: StyleNameEnum.fontStyle, value: value as boolean}
    }else if(key === 'color'){
        styleParams = {key: StyleNameEnum.color, value: value as boolean}
    }else if(key === 'background-color'){
        styleParams = {key: StyleNameEnum.backgroundColor, value: value as string}
    }else if(key === 'text-align'){
        styleParams = {key: StyleNameEnum.textAlign, value: value as string}
    }else{
        console.warn('Unknow style key')
        return 
    }
    callback = (node:AditorNode) => {
        node.setStyle(styleParams.key, styleParams.value)
        return node
    }
    view.dispatchViewEvent(new Event('click'), ViewEventEnum.UPDATE_SELECTIONS, [actionParams.selection], view.docState, {callback})

    return view.docState.sels.selections
}

function changeFormat(e:Event, view:AditorDocView, actionParams: ActionParams, item:AIFunctionInterface){
    if(!actionParams.selection) return
    const vsels = [actionParams.selection]
    if(item.id === 'delete'){
        view.dispatchViewEvent(new Event('keyup'), ViewEventEnum.DELETE_PARAGRAPH, vsels, view.docState)
    }else if(['quote', 'text', 'h1', 'h2', 'h3'].includes(item.id as string)){
        const data = {
            name: "aditorParagraph",
            data: {}
        }
        if(item.id === 'text'){
            data.name = 'aditorParagraph'
        }else if(item.id === 'h1'){
            data.name = 'aditorTitleParagraph'
            data.data = {level: '1'}
        }else if(item.id === 'h2'){
            data.name = 'aditorTitleParagraph'
            data.data = {level: '2'}
        }else if(item.id === 'h3'){
            data.name = 'aditorTitleParagraph'
            data.data = {level: '3'}
        }else if(item.id === 'quote'){
            data.name = 'aditorQuote'
        }

        view.dispatchViewEvent(new Event('keyup'), ViewEventEnum.REPLACE_PARAGRAPH, vsels, view.docState, data)
    }
}
// 旧AI功能兼容
function oldAIFunction(e:Event, view:AditorDocView, actionParams: ActionParams, item:AIFunctionInterface){
    const modelName = item.id
    const vsels = actionParams.selection ? [actionParams.selection] : []
    const {end} = view.docState.nodesel2globalpos(view.docState.vsels2Nodesels(vsels)[0])
    let text = actionParams.selectSingle ? actionParams.selText.selectedLineText : actionParams.selText.selectedText 
    //如果text首尾有换行符，去掉
    text = text.replace(/^\n+|\n+$/g, "")
    const lastNode = view.docState.findNodeByPos(end)


    /** 上面通用获取选中的文本信息， 下面处理不同的AI参数 **/
    if(modelName === 'gpt3.5'){
        oldAIAsk(view, lastNode, modelName, {
            name: modelName, // Add the missing 'name' property
            role: 'user',
            type: 'text',
            data: [{
                type: 'text',
                text: text
            }]
        })
    }else if(modelName === 'vits'){
        oldAIAsk(view, lastNode, modelName, {
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
        oldAIAsk(view, lastNode, modelName, {
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
}

function generateAiFns(view:AditorDocView, actionParams: ActionParams){
    const returnFuncs = []

    const inParagraphPosition = actionParams.inParagraphPosition
    const selectExtendName = actionParams.selectExtendName
    const result = aiAssistantStates.find((item)=>{
        if(item.inParagraphPosition == inParagraphPosition && item.selectExtendName == selectExtendName){
            return item
        }
    })

    if(result){
        if(result.name1 && result.name1.length > 0){
            const prompt = result.prompt1.replace(/\$\{before\}/g, actionParams.selText.forwardText)
                .replace(/\$\{selected\}/g, actionParams.selText.selectedText)
                .replace(/\$\{after\}/g, actionParams.selText.backwardText)
                .replace(/\$\{line\}/g, actionParams.selText.selectedLineText)
            returnFuncs.push(makeAiFunction(result.name1, result.name1, 'ai', prompt, (e:Event, item:AIFunctionInterface)=>{aiAsk(e, view, actionParams, item)}))
        }
        if(result.name2 && result.name2.length > 0){
            const prompt = result.prompt2.replace(/\$\{before\}/g, actionParams.selText.forwardText)
                .replace(/\$\{selected\}/g, actionParams.selText.selectedText)
                .replace(/\$\{after\}/g, actionParams.selText.backwardText)
                .replace(/\$\{line\}/g, actionParams.selText.selectedLineText)
            returnFuncs.push(makeAiFunction(result.name2, result.name2, 'ai', prompt, (e:Event, item:AIFunctionInterface)=>{aiAsk(e, view, actionParams, item)}))
        }
        if(result.name3 && result.name3.length > 0){
            const prompt = result.prompt3.replace(/\$\{before\}/g, actionParams.selText.forwardText)
                .replace(/\$\{selected\}/g, actionParams.selText.selectedText)
                .replace(/\$\{after\}/g, actionParams.selText.backwardText)
                .replace(/\$\{line\}/g, actionParams.selText.selectedLineText)
            returnFuncs.push(makeAiFunction(result.name3, result.name3, 'ai', prompt, (e:Event, item:AIFunctionInterface)=>{aiAsk(e, view, actionParams, item)}))
        }
        if(result.name4 && result.name4.length > 0){
            const prompt = result.prompt4.replace(/\$\{before\}/g, actionParams.selText.forwardText)
                .replace(/\$\{selected\}/g, actionParams.selText.selectedText)
                .replace(/\$\{after\}/g, actionParams.selText.backwardText)
                .replace(/\$\{line\}/g, actionParams.selText.selectedLineText)
            returnFuncs.push(makeAiFunction(result.name4, result.name4, 'ai', prompt, (e:Event, item:AIFunctionInterface)=>{aiAsk(e, view, actionParams, item)}))
        }
    }

    returnFuncs.push(makeAiFunction('talk', '对话', 'ai', '', (e:Event, item:AIFunctionInterface)=>{aiAsk(e, view, actionParams, item)}))

    if(actionParams.selectExtend){
        returnFuncs.push(makeAiFunction('insert', '插入', 'tool', '', undefined, makeInsertChildren(view, actionParams), AddIcon))
    }else{
        if(!actionParams.selectSingle){
            returnFuncs.push(makeAiFunction('style', '样式', 'tool', '', undefined, makeStyleChildren(view, actionParams), StyleIcon))
        }
        returnFuncs.push(makeAiFunction('insert', '插入', 'tool', '', undefined, makeInsertChildren(view, actionParams), AddIcon))
    }
    returnFuncs.push(makeAiFunction('change', '操作', 'tool', '', (e:Event, item:AIFunctionInterface)=>{changeFormat(e, view, actionParams, item)}, makeChangeChildren(view, actionParams), SettingIcon))


    return returnFuncs
}

function showContentColorSet(e:Event, view:AditorDocView, actionParams: ActionParams, item:AIFunctionInterface){
    hideAllContent()
    aiStates.value.width = '280px'
    aiStates.value.height = 'auto'
    aiStates.value.showContent = true
    aiStates.value.showContentColorSet = true
}

function showLinkContent(e:Event, view:AditorDocView, actionParams: ActionParams, item:AIFunctionInterface){
    hideAllContent()
    // 获取aiAssistantRef宽度
    const width = aiAssistantRef.value?.getClientRects()[0].width
    aiStates.value.width = width ? (width-20)+'px':'280px'
    aiStates.value.height = 'auto'
    aiStates.value.showContent = true
    aiStates.value.showContentLink = true
}

function showContentAITalk(e:Event, view:AditorDocView, actionParams: ActionParams, item:AIFunctionInterface){
    hideAllContent()
    aiStates.value.width = '500px'
    aiStates.value.height = 'auto'
    aiStates.value.showContent = true
    aiStates.value.showContentAITalk = true
}

function hideAllContent(){
    aiStates.value.width = '0px'
    aiStates.value.height = '0px'
    aiStates.value.showContent = false
    aiStates.value.showContentColorSet = false
    aiStates.value.showContentLink = false
    aiStates.value.showContentAITalk = false
}

// 插入的子节点
function makeInsertChildren(view: AditorDocView, actionParams: ActionParams):AIFunctionInterface[]{
    const insertChildren:AIFunctionInterface[] = [
        makeAiFunction('insertCode', '代码块', 'tool', '', (e:Event, item:AIFunctionInterface)=>{insertBlock(e, view, actionParams, item)}, [], undefined, undefined, 'aditorCode'),
        makeAiFunction('insertTalk', 'AI聊天', 'tool', '', (e:Event, item:AIFunctionInterface)=>{insertBlock(e, view, actionParams, item)}, [], undefined, undefined, 'aditorAIChat'),
        makeAiFunction('insertCanvas', 'AI画布', 'tool', '', (e:Event, item:AIFunctionInterface)=>{insertBlock(e, view, actionParams, item)}, [], undefined, undefined, 'aditorCanvas'),
        makeAiFunction('insertFormula', '公式', 'tool', '', (e:Event, item:AIFunctionInterface)=>{insertBlock(e, view, actionParams, item)}, [], undefined, undefined, 'aditorKatex'),
        makeAiFunction('insertTitle', '标题', 'tool', '', (e:Event, item:AIFunctionInterface)=>{insertBlock(e, view, actionParams, item)}, [], undefined, undefined, 'aditorTitleParagraph'),
        makeAiFunction('insertText', '文本', 'tool', '', (e:Event, item:AIFunctionInterface)=>{insertBlock(e, view, actionParams, item)}, [], undefined, undefined, 'aditorParagraph'),
        makeAiFunction('insertConfig', '配置', 'tool', '', (e:Event, item:AIFunctionInterface)=>{insertBlock(e, view, actionParams, item)}, [], undefined, undefined, 'aditorConfig'),
        makeAiFunction('insertjsMind', '思维导图', 'tool', '', (e:Event, item:AIFunctionInterface)=>{insertBlock(e, view, actionParams, item)}, [], undefined, undefined, 'aditorMindMap'),
    ]

    return insertChildren
}
// 样式的子节点
function makeStyleChildren(view: AditorDocView, actionParams: ActionParams):AIFunctionInterface[]{
    const boldHighlight = actionParams.selAttrs.fontWeight
    const italicHighlight = actionParams.selAttrs.italic
    const underlineHighlight = actionParams.selAttrs.underline
    const strikeHighlight = actionParams.selAttrs.lineThrough
    const leftHightlight = actionParams.selAttrs.alignment == '左对齐'
    const centerHightlight = actionParams.selAttrs.alignment == '居中对齐'
    const rightHightlight = actionParams.selAttrs.alignment == '右对齐'

    const styleChildren:AIFunctionInterface[] = [
        makeAiFunction(StyleName.fontWeight, '加粗', 'tool', '', (e:Event, item:AIFunctionInterface)=>{updateStyle(e, view, actionParams, item)}, [], BoldIcon, boldHighlight, !actionParams.selAttrs.fontWeight),
        makeAiFunction(StyleName.italic, '斜体', 'tool', '', (e:Event, item:AIFunctionInterface)=>{updateStyle(e, view, actionParams, item)}, [], ItalicIcon, italicHighlight, !actionParams.selAttrs.italic),
        makeAiFunction(StyleName.underline, '下划线', 'tool', '', (e:Event, item:AIFunctionInterface)=>{updateStyle(e, view, actionParams, item)}, [], UnderlineIcon, underlineHighlight, !actionParams.selAttrs.underline),
        makeAiFunction(StyleName.lineThrough, '删除线', 'tool', '', (e:Event, item:AIFunctionInterface)=>{updateStyle(e, view, actionParams, item)}, [], StrikethroughIcon, strikeHighlight, !actionParams.selAttrs.lineThrough),
        makeAiFunction(StyleName.textAlign, '左对齐', 'tool', '', (e:Event, item:AIFunctionInterface)=>{updateStyle(e, view, actionParams, item)}, [], AlignLeftIcon, leftHightlight, 'left'),
        makeAiFunction(StyleName.textAlign, '居中对齐', 'tool', '', (e:Event, item:AIFunctionInterface)=>{updateStyle(e, view, actionParams, item)}, [], AlignCenterIcon, centerHightlight, 'center'),
        makeAiFunction(StyleName.textAlign, '右对齐', 'tool', '', (e:Event, item:AIFunctionInterface)=>{updateStyle(e, view, actionParams, item)}, [], AlignRightIcon, rightHightlight, 'right'),

        makeAiFunction('setColor', '颜色', 'tool', '', (e:Event, item:AIFunctionInterface)=>showContentColorSet(e, view, actionParams, item), [], TextColorIcon)
    ]

    return styleChildren
}
// 操作的子节点
function makeChangeChildren(view: AditorDocView, actionParams: ActionParams):AIFunctionInterface[]{
    const changeChildren:AIFunctionInterface[] = [
        makeAiFunction('text', '正文', 'tool', '', (e:Event, item:AIFunctionInterface)=>{changeFormat(e, view, actionParams, item)}, [], ParagraphIcon),
        makeAiFunction('h1', '一级标题', 'tool', '', (e:Event, item:AIFunctionInterface)=>{changeFormat(e, view, actionParams, item)}, [], H1Icon),
        makeAiFunction('h2', '二级标题', 'tool', '', (e:Event, item:AIFunctionInterface)=>{changeFormat(e, view, actionParams, item)}, [], H2Icon),
        makeAiFunction('h3', '三级标题', 'tool', '', (e:Event, item:AIFunctionInterface)=>{changeFormat(e, view, actionParams, item)}, [], H3Icon),
    ]
    if(!actionParams.selectExtend){
        // 单选没有链接选项
        if(!actionParams.selectSingle){
            changeChildren.push(makeAiFunction('link', '链接', 'tool', '', (e:Event, item:AIFunctionInterface)=>{showLinkContent(e, view, actionParams, item)}, [], LinkIcon)) 
        }
        changeChildren.push(makeAiFunction('quote', '引用', 'tool', '', (e:Event, item:AIFunctionInterface)=>{changeFormat(e, view, actionParams, item)}, [], QuoteIcon))
    }
    changeChildren.push(makeAiFunction('delete', '删除', 'tool', '', (e:Event, item:AIFunctionInterface)=>{changeFormat(e, view, actionParams, item)}, [], DeleteIcon))
    
    // 添加旧的AI一键模型
    changeChildren.push(makeAiFunction('gpt3.5', '(旧)GPT', 'ai', '', (e:Event, item:AIFunctionInterface)=>{oldAIFunction(e, view, actionParams, item)}, [], undefined, undefined, 'aditorGPT3.5'))
    changeChildren.push(makeAiFunction('vits', '(旧)文生语音', 'ai', '', (e:Event, item:AIFunctionInterface)=>{oldAIFunction(e, view, actionParams, item)}, [], undefined, undefined, 'aditorVITS'))
    changeChildren.push(makeAiFunction('sd2', '(旧)文生图', 'ai', '', (e:Event, item:AIFunctionInterface)=>{oldAIFunction(e, view, actionParams, item)}, [], undefined, undefined, 'aditorSD2'))

    return changeChildren
}

// 'font-weight' | 'underline' | 'line-through' | 'italic' | 'color' | 'background-color' | 'text-align'
enum StyleName {
    fontWeight = 'fontWeight'
    , underline = 'underline'
    , lineThrough = 'lineThrough'
    , italic = 'italic'
    , color = 'color'
    , backgroundColor = 'backgroundColor'
    , textAlign = 'textAlign'
}

// Convert camel cased names to hyphenated
function toKebabCase(str: string) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

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

const defaultColorCommands = Object.keys(TEXT_COLOR).map((key) => {
    return {
        id: StyleName.color
        , name: '字体颜色'
        , icon: h(ColorSetIcon)
        , value: TEXT_COLOR[key as keyof typeof TEXT_COLOR]
        , click: (e:Event, item:any) => {
            aiCache.view && aiCache.actionParamsCache && updateStyle(e, aiCache.view, aiCache.actionParamsCache, item as AIFunctionInterface)
        }
    }
})

const defaultBackgroundColorCommands = Object.keys(BACKGROUND_COLOR).map((key) => {
    return {
        id: StyleName.backgroundColor
        , name: '背景颜色'
        , icon: h(BackgroundColorIcon)
        , value: BACKGROUND_COLOR[key as keyof typeof BACKGROUND_COLOR]
        , click: (e:Event, item:any) => {
            aiCache.view && aiCache.actionParamsCache && updateStyle(e, aiCache.view, aiCache.actionParamsCache, item as AIFunctionInterface)
        }
    }
})

export const colorCommands = {
    color: defaultColorCommands
    , backgroundColor: defaultBackgroundColorCommands
}

export const executeSetLink = (value: string | undefined)=>{
    const view = aiCache.view
    const actionParams = aiCache.actionParamsCache
    if (!view) return
    if (!actionParams) return
    if (!actionParams.selection) return

    const vsels = [actionParams.selection]
    if(value == undefined)
        value = ''
    // 如果value是字符串类型
    if(!(typeof value === 'string')){
        return 
    }
    let callback
    // 检查剔除左右空白符检查是否为空
    value = value.trim()

    if(value === ''){
            callback = (node: AditorNode) => {
            if(node.name === 'aditorLink'){
                return createAditorNode('aditorText', node.style, {}, node.text)
            }
            return node
        }
    }else{
        // 检查是否是有效的url
        const reg = /^((https|http|ftp|rtsp|mms)?:\/\/)[^\s]+/
        if(!reg.test(value)){
            value = 'http://' + value
        }
        callback = (node: AditorNode) => {
            if(node.name === 'aditorText'){
                return createAditorNode('aditorLink', node.style, {href: value}, node.text)
            }else if(node.name === 'aditorLink'){
                node.data.href = value
            }
            return node
        }
    }
    setLinkValue(value)
    view.dispatchViewEvent(new Event('click'), ViewEventEnum.UPDATE_SELECTIONS, vsels, view.docState, {callback})
}

export const setLinkValue = (value:string) => {
    if(aiCache.actionParamsCache){
        aiStates.value.linkValue = value
    }
}

export const sendAIMsg = ()=>{
    if(getIsAskAI()){
        return
    }
    aIAssistantAsk(aiStates.value.aiInput, aiTalkSessionList)
    clearAIMsg()
}

export const clearAIMsg = ()=>{
    aiStates.value.aiInput = ""
}

export const setIsAskAI = ((value:boolean)=>{
    aiStates.value.isAskAI = value
})

export const getIsAskAI = ()=>{
    if(aiStates.value.isAskAI){
        ElMessage({
            showClose: true,
            duration:0,
            message: '请等待上一轮AI回答完毕',
            type: 'success',
        })
    }
    return aiStates.value.isAskAI
}

let aiScrollTimeout: any = 0
export function scrollAiTalkToBottom() {
    clearTimeout(aiScrollTimeout);
    const aiTalkContentElement = aiTalkContentRef.value;
    if (aiTalkContentElement) {
        aiScrollTimeout = setTimeout(() => {
            aiTalkContentElement.scrollTop = aiTalkContentElement.scrollHeight;
        }, 300);
    }
}