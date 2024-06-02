import { AditorDocView, AditorNode, dispatchUpdateData, createAditorNode, VirtualSelection, ViewEventEnum } from 'vue-aditor'
import {toRaw,nextTick, ref, computed} from 'vue'
import { request } from '../../api/index.ts';
import { events } from '../../bus.ts';

let globalAskingFlag = ref(false)

export type InsertTypeEnum = 'text' | 'image' | 'audio' | 'video' | 'file'

export type RoleEnum = 'user' | 'assistant'

export interface DataText {
    type: InsertTypeEnum
    text: string
    params?: string
}

export interface DataImage {
    type: InsertTypeEnum
    src: string
    params?: string
}

export interface DataAudio {
    type: InsertTypeEnum
    src: string
    params?: string
}

export type InsertType = (DataText[]) | (DataImage[]) | (DataAudio[])

export interface AIMsgs {
    type: InsertTypeEnum
    name: string
    role: RoleEnum
    data: InsertType
    params?: string|{[key:string]:any}
    status?: boolean                // 用于判断消息是否发送成功
}

export const insertInto = (view:AditorDocView | null | undefined, node:AditorNode | null | undefined, msgs:AIMsgs[]):number | null=>{
    if(view == undefined || view == null) return null
    if(node == undefined || node == null) return null
    
    // 判断msgs每一个元素里面的status是否存在，不存在则添加上并且默认为true
    msgs.forEach(msg=>{if(msg.status == undefined || msg.status == null) msg.status = true})
    if(node.name==='aditorAIChat'){
        const i = node.data.msgs.length
        // 把新的msgs数组添加到原来的msgs数组中
        dispatchUpdateData(view, node.start, Object.assign(node.data, {msgs: node.data.msgs.concat(msgs)}))
        // 插入消息后，滚动到Div底部
        nextTick(()=>{
            // 找到元素属性vid=node.virtualId的元素
            const targetElement = document.querySelectorAll(`[vid="${node.virtualId}"]`)[0]
            // 找到targetElement里面的class=aditor-aichat-content
            const chatDiv = targetElement?.querySelector('.aditor-aichat-content')
            // const chatDiv = document.getElementById('chatDiv')
            chatDiv?.scrollTo(0, chatDiv.scrollHeight)
        })
        return i
    }else return null
}

export const deleteMsg = (view:AditorDocView | null | undefined, node:AditorNode | null | undefined, index:number)=>{
    if(globalAskingFlag.value) return
    _deleteMsg(view, node, index)
}

export const _deleteMsg = (view:AditorDocView | null | undefined, node:AditorNode | null | undefined, index:number)=>{
    if(view == undefined || view == null) return 
    if(node == undefined || node == null) return 

    if(node.name==='aditorAIChat'){
        const newMsgs = (node.data.msgs as AIMsgs[]).filter((_msg, i)=>i!==index)
        const newData = Object.assign(node.data, {msgs: newMsgs})
        dispatchUpdateData(view, node.start, newData)
    }else return  
}

export const aiAsk = async (view: AditorDocView | null | undefined, askNode: AditorNode | null | undefined, model: 'gpt3.5' | 'sd2'| 'vits' | 'qianfan', msg: AIMsgs)=>{
    if(view == undefined || view == null) return 
    if(askNode == undefined || askNode == null) return
    if(globalAskingFlag.value) return

    globalAskingFlag.value = true
    try{
        let aiChat:AditorNode|null|undefined = null 
        if(askNode.name === 'aditorAIChat'){
            aiChat = askNode
        }else{
            aiChat = view.docState.findNearestRightNodeByNode(toRaw(askNode))?.dfsDeepestLeftStartNode()
        }
        // 先插入用户请求信息
        if(aiChat && aiChat.name === 'aditorAIChat'){
            insertInto(view, aiChat, [msg])
        }else{
            aiChat = createAditorNode('aditorAIChat', {}, {msgs: [msg]})
            const parentNode = createAditorNode('aditorParagraph', {}, {})
            'children' in parentNode && parentNode.children.push(aiChat)
            const vsels:VirtualSelection[] = [{
                start: askNode.end,
                end: askNode.end,
                startOffset: 0,
                endOffset: 0
            }]
            view.dispatchViewEvent(new Event('keydown'), ViewEventEnum.INSERT_NODES_SELECTIONS_AT_ROOT, vsels, view.docState, { nodeList: [parentNode] });
        }

        // 先插入一条等待信息
        const delIndex = insertInto(view, aiChat, [{
            'type': 'text',
            'name': 'system',
            'role': 'assistant',
            'data': [{
                'type': 'text',
                'text': '正在请求...'
            }],
            'status': false
        }])
        
        // 远程请求
        if(model === 'gpt3.5'){
            const result = await _askGPT(aiChat, msg)
            delIndex && _deleteMsg(view, aiChat, delIndex)
            insertInto(view, aiChat, result)
            globalAskingFlag.value = false
        }else if(model === 'sd2'){
            const result = await _askSD2(msg.params as {[key:string]:any})
            delIndex && _deleteMsg(view, aiChat, delIndex)
            insertInto(view, aiChat, result)
            globalAskingFlag.value = false
        }else if(model === 'vits'){
            const result = await _askVits(msg.params as {[key:string]:any})
            delIndex && _deleteMsg(view, aiChat, delIndex)
            insertInto(view, aiChat, result)
            globalAskingFlag.value = false
        }else if(model === 'qianfan'){
            const result = await _askQianfan(aiChat, msg)
            delIndex && _deleteMsg(view, aiChat, delIndex)
            insertInto(view, aiChat, result)
            globalAskingFlag.value = false
        }
        events.emit('hide-progress')
        events.emit('stop-server-polling')
    }catch(e){
        globalAskingFlag.value = false
        events.emit('hide-progress')
        events.emit('stop-server-polling')
        console.warn('aiAsk error:', e)
    }
    
}

const _askGPT = async (aiChat: AditorNode, msg:AIMsgs):Promise<AIMsgs[]>=>{
    const history:{role:string, content:string}[] = [] as {role:string, content:string}[]
    // 遍历所有的消息，将其中的text提取出来
    (toRaw(aiChat).data.msgs as AIMsgs[]).forEach((msg:AIMsgs)=>{
        let t = ''
        if(msg.type === 'text'){
            (msg.data as DataText[]).forEach((data:DataText)=>{
                if(data.type === 'text'){
                    t += data.text
                }
            })
        }
        if(t && t != ''){
            history.push({
                role: msg.role,
                content: t
            })
        }
    })

    // 遍历msg.data中所有type=text的元素，将其中的text拼接起来
    let text = ''
    msg.data.forEach((data: DataText | DataImage | DataAudio) => {
        if (data.type === 'text') {
            text += (data as DataText).text;
        }
    });

    return await request.chatgpt({ text, history }).then((res)=>{
        return res.data.contents
    }).catch((res)=>{
        console.warn('request error:', res)
        return [{
            'type': 'text',
            'name': 'system',
            'role': 'assistant',
            'data': [{
                'type': 'text',
                'text': '请求错误:'+res
            }]
        }]
    })
}

const _askQianfan = async (aiChat: AditorNode, msg:AIMsgs):Promise<AIMsgs[]>=>{
    const history:{role:string, content:string}[] = [] as {role:string, content:string}[]
    // 遍历所有的消息，将其中的text提取出来
    (toRaw(aiChat).data.msgs as AIMsgs[]).forEach((msg:AIMsgs)=>{
        let t = ''
        if(msg.type === 'text'){
            (msg.data as DataText[]).forEach((data:DataText)=>{
                if(data.type === 'text'){
                    t += data.text
                }
            })
        }
        if(t && t != ''){
            history.push({
                role: msg.role,
                content: t
            })
        }
    })

    // 遍历msg.data中所有type=text的元素，将其中的text拼接起来
    let text = ''
    msg.data.forEach((data: DataText | DataImage | DataAudio) => {
        if (data.type === 'text') {
            text += (data as DataText).text;
        }
    });

    return await request.qianfanChat({ text, history }).then((res)=>{
        return res.data.contents
    }).catch((res)=>{
        console.warn('request error:', res)
        return [{
            'type': 'text',
            'name': 'system',
            'role': 'assistant',
            'data': [{
                'type': 'text',
                'text': '请求错误:'+res
            }]
        }]
    })
}

const _askSD2 = async (params:{[key:string]:any}):Promise<AIMsgs[]>=>{
    // 展示进度条
    events.emit('show-progress')
    // 开启轮询
    const callback = async ()=>{
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
    events.emit('start-server-polling', {callback, interval: 100})

    // 判断是否是文生图，文生图单独api
    if(params.fname === 'txt2img'){
        return await request.aiTxt2Img(params).then((response):AIMsgs[] => {
            try {
                if (response.status == 200) {
                    if (response.data.images?.length >= 1) {
                        const images:DataImage[] = []
                        for (let item of response.data.images) {
                            // 如果item.images[0]是一个url,如'./','/','http'等开头，则不需要拼接
                            let src = item.images[0]
                            if (!src.startsWith("./") && !src.startsWith("/") && !src.startsWith("http")) {
                                src = src.startsWith("data:image/png;base64,") ? src : "data:image/png;base64," + src;
                            }
                            images.push({
                                type: 'image',
                                src: src as string
                            })
                        }
                        return [{
                            type: 'image',
                            name: 'sd2',
                            role: 'assistant',
                            data: images
                        }]
                    }
                }
                return [{
                    type: 'text',
                    name: 'sd2',
                    role: 'assistant',
                    data: [{
                        type: 'text',
                        text: '没有完成绘画'
                    }]
                }]
            } catch (e) {
                return [{
                    type: 'text',
                    name: 'system',
                    role: 'assistant',
                    data: [{
                        type: 'text',
                        text: '请求错误:' + e
                    }]
                }]
            }
        }
        ).catch(e => {
            console.warn(e)
            return [{
                type: 'text',
                name: 'system',
                role: 'assistant',
                data: [{
                    type: 'text',
                    text: '请求错误:' + e
                }]
            }]
        })
    }

    // 否则正常的图生图相关模式
    return await request.aiDraw(params).then((response):AIMsgs[] => {
        try {
            if (response.status == 200) {
                if (response.data.images?.length >= 1) {
                    const images:DataImage[] = []
                    for (let item of response.data.images) {
                        // 如果item.images[0]是一个url,如'./','/','http'等开头，则不需要拼接
                        let src = item.images[0]
                        if (!src.startsWith("./") && !src.startsWith("/") && !src.startsWith("http")) {
                            src = src.startsWith("data:image/png;base64,") ? src : "data:image/png;base64," + src;
                        }
                        images.push({
                            type: 'image',
                            src: src as string
                        })
                    }
                    return [{
                        type: 'image',
                        name: 'sd2',
                        role: 'assistant',
                        data: images
                    }]
                }
            }
            return [{
                type: 'text',
                name: 'sd2',
                role: 'assistant',
                data: [{
                    type: 'text',
                    text: '没有完成绘画'
                }]
            }]
        } catch (e) {
            return [{
                type: 'text',
                name: 'system',
                role: 'assistant',
                data: [{
                    type: 'text',
                    text: '请求错误:' + e
                }]
            }]
        }
    }).catch(e => {
        console.warn(e)
        return [{
            type: 'text',
            name: 'system',
            role: 'assistant',
            data: [{
                type: 'text',
                text: '请求错误:' + e
            }]
        }]
    })

}

const _askVits = async (params:{[key:string]:any}):Promise<AIMsgs[]>=>{
    let text = params?.text
    if(!text) text = '请提供文本'
    
    return await request.aiVoice({text}).then((response):AIMsgs[] => {
        try {
            if (response.status == 200) {
                if (response.data.status === 'Success') {
                    const src = 'data:audio/wav;base64,' + response.data.audios;
                    return [{
                        type: 'audio',
                        name: 'vits',
                        role: 'assistant',
                        data: [{
                            type: 'audio',
                            src: src
                        }]
                    }]
                }
            }
            return [{
                type: 'text',
                name: 'vits',
                role: 'assistant',
                data: [{
                    type: 'text',
                    text: '没有生成音频'
                }]
            }]
        } catch (e) {
            return [{
                type: 'text',
                name: 'system',
                role: 'assistant',
                data: [{
                    type: 'text',
                    text: '请求错误:' + e
                }]
            }]
        }
    }).catch(e => {
        console.warn(e)
        return [{
            type: 'text',
            name: 'system',
            role: 'assistant',
            data: [{
                type: 'text',
                text: '请求错误:' + e
            }]
        }]
    })
}

export const isAsking = computed(()=>globalAskingFlag)