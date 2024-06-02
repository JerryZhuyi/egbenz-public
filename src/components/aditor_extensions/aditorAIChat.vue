<template>
    <div class="aditor-ai-chat" contenteditable="false" aditor-ignore-event>
        <div class="aditor-aichat-title">
            <div>AIChat</div>
            <div>
                <el-switch
                    v-model="isShow"
                    class="ml-2"
                    inline-prompt
                    active-text="收起"
                    inactive-text="展示"
                />
            </div>
        </div>
        <div v-show="isShow" ref="aditorAIChatRef" class="aditor-aichat-content">
            <div v-for="(msg, i) in dataRef">
                <div class="aditor-ai-msg-box msg-box-assistant" v-if="msg.role === 'assistant'">
                    <div class="msg-avator">
                        <div class="msg-avator-inner"><AssistantIcon width="18"/></div>
                    </div>
                    <div class="msg-content-box">
                        <div class="msg-content-inner">
                            <div v-if="msg.status === false" class="msg-chat-think">
                                <span>思考中</span>
                                <div class="dot-loader">
                                    <div></div>
                                    <div></div>
                                    <div></div>
                                </div>
                            </div>
                            <div v-else class="msg-chat-bubble">
                                <div v-for="(data, _) in (msg.data)">
                                    <span v-if="data.type === 'text'" v-text="(data as DataText).text"></span>
                                    <img v-if="data.type === 'image'" :src="(data as DataImage).src" style="max-width: 150px; max-height: 200px; "/>
                                    <audio v-if="data.type === 'audio'" :src="(data as DataAudio).src" controls></audio>
                                </div>
                            </div>
                        </div>
                        <div class="msg-operator">
                            <div class="msg-operator-inner">
                                <button @click="deleteMsg(i)">删除</button>
                                <button @click="copyMsg(i)">复制</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="aditor-ai-msg-box msg-box-user" v-else-if="msg.role === 'user'">
                    <div class="msg-content-box">
                        <div class="msg-content-inner">
                            <div v-if="msg.status === false" class="msg-chat-think">
                                <span>思考中</span>
                                <div class="dot-loader">
                                    <div></div>
                                    <div></div>
                                    <div></div>
                                </div>
                            </div>
                            <div v-else class="msg-chat-bubble">
                                <div v-for="(data, _) in (msg.data)">
                                    <span v-if="data.type === 'text'" v-text="(data as DataText).text"></span>
                                    <img v-if="data.type === 'image'" :src="(data as DataImage).src" style="max-width: 150px; max-height: 200px; "/>
                                    <audio v-if="data.type === 'audio'" :src="(data as DataAudio).src" controls></audio>
                                </div>
                            </div>
                        </div>
                        <div class="msg-operator">
                            <div class="msg-operator-inner">
                                <button @click="deleteMsg(i)">删除</button>
                                <button @click="copyMsg(i)">复制</button>
                            </div>
                        </div>
                    </div>
                    <div class="msg-avator">
                        <div class="msg-avator-inner"><UserIcon width="18"/></div>
                    </div>
                </div>
            </div>
        </div>
        <div v-show="isShow" class="aditor-aichat-input">
            <el-input
                v-model="inputVal"
                placeholder="请输入消息"
                class="input-with-select"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 5 }"
                >
            </el-input>
            <!-- 两个紧靠的div -->
            <div style="display: flex; margin-left:10px;">
                <el-select v-model="selectedModel" placeholder="gpt3.5" style="width: 115px; font-size:12px;">
                    <el-option label="gpt3.5" value="gpt3.5" />
                    <el-option label="sd2" value="sd2" />
                    <el-option label="vits" value="vits" />
                    <el-option label="qianfan" value="qianfan" />
                </el-select>
                <el-button class="aditor-ai-send" :disabled="isAsking" @click="sendAIMsg">发送</el-button>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, PropType, computed, ComputedRef, ref } from 'vue'
import { AditorDocView,ANodeType,ExportNodeConfig,AditorNode } from 'vue-aditor'
import { AIMsgs, DataText, DataImage, DataAudio, deleteMsg as _deleteMsg, isAsking, aiAsk } from './aditorAIChatUtils'
import {
    Send24Filled as AssistantIcon,
    Person24Filled as UserIcon,
} from '@vicons/fluent'

const config:ExportNodeConfig = {
    secondaryType: ANodeType.BlockLeaf,
    dataKeyName: 'msgs',
    validStyleList: [
    ],
    defaultData: {
        msgs: []
    },
}

type modelName = 'gpt3.5' | 'sd2' | 'vits' | 'qianfan'

export default defineComponent({
    name: 'aditorAIChat',
    components: {
        AssistantIcon,UserIcon
    },
    props: {
        aNode: {
            type: Object as PropType<AditorNode>,
            required: true,
        },
        docView: {
            type: Object as PropType<AditorDocView>,
            required: true,
        }
    },
    setup(props) {
        const isShow = ref<boolean>(true)
        const inputVal = ref<string>('')
        const selectedModel = ref<modelName>('gpt3.5')
        const aditorAIChatRef = ref<HTMLElement|null>(null)
        const dataRef:ComputedRef<AIMsgs[]> = computed(()=>props.aNode.data.msgs)
        
        const sendAIMsg = ()=>{
            const getParams:{[key in modelName]:()=>AIMsgs} = {
                'gpt3.5': getGPT3Params,
                'sd2': getSD2Params,
                'vits': getVITSParams,
                'qianfan': getQianfanParams,
            }
            aiAsk(props.docView, props.aNode, selectedModel.value, getParams[selectedModel.value]())
            inputVal.value = ''
        }
        const getGPT3Params = ():AIMsgs=>{
            return {
                type: 'text',
                name: 'gpt3.5',
                role: 'user',
                data: [{
                    type:'text',
                    text:inputVal.value
                }]
            }
        }
        const getQianfanParams = ():AIMsgs=>{
            return {
                type: 'text',
                name: 'qianfan',
                role: 'user',
                data: [{
                    type:'text',
                    text:inputVal.value
                }]
            }
        }
        const getSD2Params = ():AIMsgs=>{
            return {
                name: "sd2", // Add the missing 'name' property
                role: 'user',
                type: 'text',
                data: [{
                    type: 'text',
                    text: "请根据下面文字做画\n"+inputVal.value
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
                    prompt: inputVal.value,
                    negative_prompt: "(worst quality:2), (low quality:2), (normal quality:2), lowres, normal quality, ((monochrome)), ((grayscale)), skin spots, acnes, skin blemishes, age spot, (ugly:1.331), (duplicate:1.331), (morbid:1.21), (mutilated:1.21), (tranny:1.331), mutated hands, (poorly drawn hands:1.5), blurry, (bad anatomy:1.21), (bad proportions:1.331), extra limbs, (disfigured:1.331), (missing arms:1.331), (extra legs:1.331), (fused fingers:1.61051), (too many fingers:1.61051), (unclear eyes:1.331), lowers, bad hands, missing fingers, extra digit,bad hands, missing fingers, (((extra arms and legs)))",
                }
            }
        }
        const getVITSParams = ():AIMsgs=>{
            return {
                name: 'vits', // Add the missing 'name' property
                role: 'user',
                type: 'text',
                data: [{
                    type: 'text',
                    text: "请帮我把下面文字转成语音:\n"+inputVal.value
                }],
                params:{
                    text: inputVal.value
                }
            }
        }

        const deleteMsg = (index: number)=>{
            _deleteMsg(props.docView, props.aNode, index)
        }
        const copyMsg = (index: number)=>{
            if(aditorAIChatRef.value && aditorAIChatRef.value?.children[index]){
                const pDiv = aditorAIChatRef.value?.children[index]
                const div = pDiv?.querySelector('.msg-chat-bubble')
                if(div){
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
            }
        }

        return {
            inputVal,
            selectedModel,
            aditorAIChatRef,
            dataRef,
            sendAIMsg,
            deleteMsg,
            copyMsg,
            isAsking: isAsking.value,
            isShow
        }
    },
    config
})
</script>
<style scoped>
.aditor-ai-chat{
    min-width: 680px;
    max-width: 1200px;
    margin:20px 0px !important;
    /* 漂亮的边框，带阴影 */
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    box-shadow: 0 2px 4px 0 rgba(0,0,0,0.05);
    /* 聊天框整体为灰色底 */
    background-color: #f9f9f9;
    font-size:14px;
}
.aditor-aichat-title{
    padding: 11px 20px;
    font-size: 16px;
    font-weight: bold;
    color: #333;
    background-color: #fff;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
/* 自动撑开高度样式，最高600px，最少300px */
.aditor-aichat-content{
    padding: 10px;
    max-height: 600px;
    min-height: 100px;
    overflow-y: auto;
}

/* 固定高度,120px */
.aditor-aichat-input{
    padding: 10px 20px;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.aditor-ai-select{
    width: 100px;
    height: 30px;
    padding: 0px 10px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    font-size: 14px;
    /* 取消聚焦时的粗黑框 */
    outline: none;
    cursor: pointer;
    /* 取消左边圆角和边框 */
    border-left:none;
}


/* 隔行换颜色 */
.aditor-ai-msg-box{
    color: rgb(0, 0, 0);
    min-height:60px;
    display: flex;
}
.aditor-ai-msg-box:nth-child(odd){
    min-height: 60px;
}
/* display=flex下高度为整行 */
.msg-avator{
    width: 60px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
}
.msg-avator-inner{
    margin: 10px;
    width: 40px;
    height: 40px;
    display: flex;
    justify-content: center;
    /* 金属黑头像背景，圆角框 */
    background-color: #fff;
    border-radius: 4px;
    color: #333;
}
/* user下的头像为淡灰色背景 */
.msg-box-user .msg-avator-inner{
    background-color: #000;
    color: #fff;
}
.msg-content-box{
    flex: 1;
}
.msg-content-inner{
    padding: 5px 0px;
}
/* 实际的聊天气泡框,白底黑字 */
.msg-chat-bubble{
    min-height:30px;
    max-width: 60%;
    line-height: 30px;
    display: inline-block;
    padding: 10px;
    border-radius: 4px;
    background-color: #fff;
    color: #333;
}
/* user下的聊天气泡为微信设计颜色的绿底白字 */
.msg-box-user .msg-chat-bubble{
    background-color: #9cda62;
    color: #000;
    text-align: left;
}

/* msg-chat-bubble下的元素都向左浮动，右边距10px */
.msg-chat-bubble > *{
    float: left;
    margin-right: 10px;
}
/* 每一行最后一个元素没有右边距 */
.msg-chat-bubble > *:last-child{
    margin-right: 0px;
}

.msg-box-user .msg-content-inner{
    text-align: right;
}
.msg-operator{
    padding: 5px 0px;
    width: 100%;
    font-size:12px;
}
.msg-operator-inner{
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    height: 100%;
}
/* msg-operator-inner 下的button较小，类似文本按钮 */
.msg-operator-inner button{
    padding: 0px 5px;
    margin-right: 5px;
    border: none;
    background-color: transparent;
    color: #555;
    font-size: 12px;
    cursor: pointer;
    /* 渐变动画 */
    transition: color 0.3s;
}
.msg-operator-inner button:hover{
    color: #000;
}

.msg-box-user .msg-operator-inner{
    justify-content: flex-end;
}


/* 三个点加载效果 */
.msg-chat-think{
    min-height:30px;
    max-width: 60%;
    line-height: 30px;
    display: inline-block;
    padding: 10px;
    border-radius: 4px;
    background-color: #fff;
    color: #333; 
}
.msg-chat-think > *{
    float: left;
}

.dot-loader {
    display: flex;
    justify-content: space-around;
    align-items: center;
    height: 30px;
}

.dot-loader div {
    width: 6px;
    height: 6px;
    margin-left:2px;
    border-radius: 50%;
    background: #333;
    animation: dot-bounce 1.0s infinite ease-in-out;
}

.dot-loader div:nth-child(2) {
  animation-delay: 0.2s;
}

.dot-loader div:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1.0); }
}

</style>