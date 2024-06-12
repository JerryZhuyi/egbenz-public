import { nextTick, toRaw, unref } from "vue"
import { AditorDocState, AditorDocView, AditorNode, ViewEventEnum
    , VirtualSelection, setDOMSelection, createAditorNode 
    , ANodeType, StyleNameEnum
} from "vue-aditor"

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

export type SelAttrs = {
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

export function getSelectionAttributes(state: AditorDocState, vsels:VirtualSelection[]): SelAttrs{
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

    // recursive all nodes
    const _recursiveLookNode = (node: AditorNode, start: number, end: number, startOffset: number, endOffset: number) => {
        if(node.start > (end+endOffset) || node.end < (start+startOffset)){
            return
        }else if(node.start != 0){
            if(node.type === ANodeType.Child){
                node.children.forEach(child => {
                    _recursiveLookNode(child, start, end, startOffset, endOffset)
                })
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
        }else{
            node.children.forEach(child => {
                _recursiveLookNode(child, start, end, startOffset, endOffset)
            })
        }
    }
    vsels.forEach(vsel => {
        const {start, end, startOffset, endOffset} = vsel
        _recursiveLookNode(state.root, start, end, startOffset, endOffset)
    })

    //JS statistics the number of different elements in a list
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
    return selAttrs
}

export function setSelectionAttributes({ view, vsels, key, value, setSelection=true }: { view: AditorDocView, vsels: VirtualSelection[], key: string, value: string|boolean|AditorNode[], setSelection?:boolean }): VirtualSelection[] | undefined{
    const styleTransform = ['font-weight', 'underline', 'line-through', 'italic', 'color', 'background-color', 'text-align']
    const nodeTransform = ['title']
    const eventTransform = ['copy', 'cut', 'delete']

    const insertBlock = ['insert_node']
    key = toKebabCase(key)
    // if 'setSelection' in params

    if(styleTransform.includes(key)){
        let styleParams: {key: StyleNameEnum, value: string|boolean}
        let callback
        if(key === 'font-weight'){
            styleParams = {key: StyleNameEnum.fontWeight, value: value as string}
        }else if(key === 'underline'){
            styleParams = {key: StyleNameEnum.underline, value: value as string}
        }else if(key === 'line-through'){
            styleParams = {key: StyleNameEnum.lineThrough, value: value as string}
        }else if(key === 'italic'){
            styleParams = {key: StyleNameEnum.fontStyle, value: value as string}
        }else if(key === 'color'){
            styleParams = {key: StyleNameEnum.color, value: value as string}
        }else if(key === 'background-color'){
            styleParams = {key: StyleNameEnum.backgroundColor, value: value as string}
        }else if(key === 'text-align'){
            styleParams = {key: StyleNameEnum.textAlign, value: value as string}
        }else{
            console.warn('Unknow style key')
            return 
        }
        callback = (node:AditorNode, states: AditorDocState) => {
            node.setStyle(styleParams.key, styleParams.value)
            return node
        }
        view.dispatchViewEvent(new Event('click'), ViewEventEnum.UPDATE_SELECTIONS, vsels, view.docState, {callback, setSelection})
    }else if(nodeTransform.includes(key)){
        let callback

        if(key === 'title'){
            callback = (node: AditorNode, states:AditorDocState) => {
                if(node.type === ANodeType.Child){
                    if(key === 'title' && ['1', '2', '3'].includes(value as string)){
                        const newNode = createAditorNode('aditorTitleParagraph', node.style, {level: value as '1' | '2' | '3'})
                        newNode.children = node.children
                        return newNode
                    }else if(key === 'title' && value === 'p'){
                        const newNode = createAditorNode('aditorParagraph', node.style, {}, node.text)
                        newNode.children = node.children
                        return newNode
                    }
                }
                return node
            }
        }
        else{
            console.warn('Unknow update method')
            return
        }
        
        view.dispatchViewEvent(new Event('click'), ViewEventEnum.UPDATE_SELECTIONS, vsels, view.docState, {callback, setSelection})
    }else if(key === 'cacheSelection'){

    }else if(key === 'href'){
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
             callback = (node: AditorNode, states:AditorDocState) => {
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
            callback = (node: AditorNode, states:AditorDocState) => {
                if(node.name === 'aditorText'){
                    return createAditorNode('aditorLink', node.style, {href: value}, node.text)
                }else if(node.name === 'aditorLink'){
                    node.data.href = value
                }
                return node
            }
        }

        view.dispatchViewEvent(new Event('click'), ViewEventEnum.UPDATE_SELECTIONS, vsels, view.docState, {callback, setSelection})
    }else if(eventTransform.includes(key)){
        if(key === 'copy'){
            copySelection(view, vsels)
        }else if(key === 'cut'){
            cutSelection(view, vsels)
        }else if(key === 'delete'){
            deleteSelection(view, vsels)
        }
    }else if(insertBlock.includes(key)){
        // adjust vsels
        // No matter where the current vsels are, insert it after the last node of the current vsels
        // and all vsels are set to single selection
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
        view.dispatchViewEvent(new Event('keydown'), ViewEventEnum.INSERT_NODES_SELECTIONS, adjustVsels, view.docState, { nodeList: value });
    }

    return view.docState.sels.selections

}

function copySelection(view: AditorDocView, _vsels: VirtualSelection[]){
    // 调用浏览器默认的复制
    const vsels: VirtualSelection[] = []
    // adjust _vsels 
    // copy inner
    _vsels.forEach(vsel => {
        const startNode = view.docState.findNodeByPos(vsel.start)
        const endNode = view.docState.findNodeByPos(vsel.end)
        const leftNode = startNode?.dfsDeepestLeftStartNode()
        const rightNode = endNode?.dfsDeepestRightEndNode()
        vsels.push({
            start: leftNode?.start || 0,
            end: rightNode?.start || 0,
            startOffset: 0,
            endOffset: rightNode?.length() || 0
        })
    })
    setDOMSelection(view, vsels)
    document.execCommand('copy')
    // 取消选中
    nextTick(()=>{
        window.getSelection()?.removeAllRanges()
    })
}

function cutSelection(view: AditorDocView, vsels: VirtualSelection[]){
    copySelection(view, vsels)
    deleteSelection(view, vsels)
}

function deleteSelection(view: AditorDocView, _vsels: VirtualSelection[]){
    const vsels: VirtualSelection[] = []
    // adjust vsels
    _vsels.forEach(vsel => {
        vsels.push({
            start: vsel.start,
            end: vsel.start,
            startOffset: 0,
            endOffset: vsel.end
        })
    })
    view.dispatchViewEvent(new Event('keydown'), ViewEventEnum.DELETE_SELECTIONS, _vsels, view.docState, {setSelection:false})
}

// Convert camel cased names to hyphenated
function toKebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}