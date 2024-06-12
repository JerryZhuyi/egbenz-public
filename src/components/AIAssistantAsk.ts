import { getIsAskAI, setIsAskAI, scrollAiTalkToBottom, aiCache, aiStates } from './AIAssistant' 
import { request } from '../api/index'
import { ViewEventEnum } from 'vue-aditor'
import { ref } from 'vue'

export interface AIMsgInterface{
    role:string
    , name: string
    , type: string
    , content:string
    , load: boolean
    , replaceClick?: (()=>void) | ((e:Event)=>void)
    , appendClick?: (()=>void) | ((e:Event)=>void)
    , copyClick?: (()=>void) | ((e:Event)=>void)
}

export type AISession = AIMsgInterface[]

export class AITalkSessionList{
    private sessions = ref<AISession[]>([])
    private maxSessions: number = 30
    private currentSessionIndex = ref<number>(-1)

    constructor(){
    }

    public newSession(){
        const aiSession:AISession = []
        this.addSession(aiSession)
    }

    public addSession(session: AISession){
        if(this.sessions.value.length >= this.maxSessions){
            this.sessions.value.shift()
        }
        this.sessions.value.push(session)
        this.currentSessionIndex.value = this.sessions.value.length - 1
    }

    public getCurrentSession(){
        if(this.currentSessionIndex.value !== -1){
            return this.sessions.value[this.currentSessionIndex.value]
        }
        return []
    }

}

let cachePrompt = ""

export const aIAssistantAsk = (_prompt: string, aiTalkSessionList: AITalkSessionList)=>{
    // 删除两边的空格
    const prompt = makePrompt(_prompt)
    // 如果prompt为空
    if(!prompt) return

    const aiSession = aiTalkSessionList.getCurrentSession()

    
    try{
        insertMsg(makeMsg("user", prompt, "text", "user", false), aiSession)
        const talkHistory:any = []
        aiSession.forEach((_item)=>{
            talkHistory.push({
                role: _item.role,
                content: _item.content
            })
        })
        insertMsg(makeMsg("assistant", "Loading...", "text", "system", true), aiSession)
        setIsAskAI(true)
        request.chatgpt({text: prompt, history:talkHistory}).then(res=>{
            deleteRecentLoadMsg(aiSession)
            if(res.status && res?.data?.contents){
                const _contents = res.data.contents
                if(Array.isArray(_contents)){
                    _contents.forEach((_item: any)=>{
                        const _name = _item?.name || "system" 
                        const _role = _item?.role || "assistant"
                        const _type = _item?.type || "text"
                        if(_item?.data && Array.isArray(_contents)){
                            _item.data.forEach((_data: any)=>{
                                insertMsg(makeMsg(_role, _data?.text || "", _item?.type || _type, _name, false), aiSession)
                            })
                        }
        
                    })
                }
            }
            setIsAskAI(false)
        }).catch(err=>{
            insertMsg(makeMsg("assistant", '请求错误:'+err, "text", "system", false), aiSession)
            setIsAskAI(false)
        })
    }catch(err){
        setIsAskAI(false)
    }
}

const makePrompt = (_prompt: string)=>{
    if(cachePrompt && cachePrompt.trim() !== ''){
        const prompt = '关于这段内容"'+cachePrompt+'"的内容。\n'+_prompt.trim()
        cachePrompt = ""
        return prompt
    }else{
        return _prompt.trim()
    }
}

const makeMsg = (role: string, content: string, type: string, name: string, load: boolean)=>{
    const msg:AIMsgInterface = {
        role: role,
        content: content,
        type: type,
        name: name,
        load: load,
    }
    if(aiCache && aiCache.actionParamsCache){
        if(!aiCache.actionParamsCache.selectSingle){
            msg.replaceClick = (e:Event)=>replaceMsg(e, msg)
        }else{
            msg.appendClick = (e: Event)=>appendMsg(e, msg)
        }
    }


    msg.copyClick = (e:Event)=>copyMsg(e, msg)

    return msg
}


export const insertMsg = (msg: AIMsgInterface, aiSession: AISession)=>{
    aiSession.push(msg)
    scrollAiTalkToBottom()
}

export const deleteMsg = (index: number, aiSession: AISession)=>{
    if(index !== -1){
        aiSession.splice(index, 1)
    }
}

export const deleteRecentLoadMsg = (aiSession: AISession)=>{
    const index = aiSession.findIndex((item)=>item.load)
    deleteMsg(index, aiSession)
}

export const truncateMsg = (aiSession: AISession)=>{
    aiSession = []
}

export const replaceMsg = (e:Event, item: AIMsgInterface)=>{
    if(ensureAICache()){
        const selection = aiCache.actionParamsCache?.selection
        const view = aiCache.view
        if(!selection) return 
        if(aiCache.actionParamsCache?.selectExtend){
            // 获取vueComponent,如果存在，且存在replaceMsg,则传入msg和selection
            const vuewComponent = aiCache.actionParamsCache.selection?.extend?.vid && view?.getVueComponent(aiCache.actionParamsCache.selection?.extend?.vid)
            if(vuewComponent && vuewComponent.exposed.replaceMsg){
                vuewComponent.exposed.replaceMsg(item, selection)
            }
        }
        // 如果不是extend选区，则
        else{
            view?.dispatchViewEvent(e, ViewEventEnum.REPLCAE_SELECTIONS, [selection], view.docState, {text: item.content})
        }
        
    }
}

export const appendMsg = (e:Event, item: AIMsgInterface)=>{
    if(ensureAICache()){
        const selection = aiCache.actionParamsCache?.selection
        const view = aiCache.view
        if(!selection) return 
        if(aiCache.actionParamsCache?.selectExtend){
            // 获取vueComponent,如果存在，且存在replaceMsg,则传入msg和selection
            const vuewComponent = aiCache.actionParamsCache.selection?.extend?.vid && view?.getVueComponent(aiCache.actionParamsCache.selection?.extend?.vid)
            if(vuewComponent && vuewComponent.exposed.appendMsg){
                vuewComponent.exposed.appendMsg(item, selection)
            }
        }
        // 如果不是extend选区，则
        else{
            view?.dispatchViewEvent(e, ViewEventEnum.REPLCAE_SELECTIONS, [selection], view.docState, {text: item.content})
        }
        
    }
}

export const copyMsg = (e:Event, item: AIMsgInterface)=>{
    // 创建一个div元素，文本内容是item.content
    const div = document.createElement('div')
    div.textContent = item.content
    document.body.appendChild(div)
    div.style.position = 'absolute'
    // 把Div加入到body中，并设置display为hidden
    div.style.display = 'hidden'
    
    // 创建一个Range对象，并选择DIV元素
    const range = document.createRange();
    range.selectNode(div);
    // 获取当前的Selection对象，并清除所有选区
    const selection = window.getSelection();
    selection?.removeAllRanges();
    // 将创建的Range对象添加到Selection对象中
    selection?.addRange(range);
    // 执行复制操作
    document.execCommand('copy');
    // 清除选区
    selection?.removeAllRanges(); 
}

export const cacheAskPrompt = (prompt: string)=>{
    cachePrompt = prompt
}

function ensureAICache(){
    if(aiCache && aiCache.actionParamsCache && aiCache.view && aiCache.actionParamsCache.selection) return true
    return false
}