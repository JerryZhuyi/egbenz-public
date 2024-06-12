<template>
    <div ai-ass-juge ref="aiAssistantRef" class="ai-assistant" :class="{'ai-assistant-hide': aiStates.isHide}">
        <el-card class="anime-ai-assistant" :body-class="'ai-el-card'" :body-style="{'padding': '5px 10px', 'font-size': '12px'}" shadow="hover">
            <div style="display: flex">
                <template v-for="(item, i) of aiFuncs">
                    <el-button v-if="item.group === 'ai'" size="small" text @click="(e:Event)=>item.click && item?.click(e, item)" >{{ item.name }}</el-button>
                </template>

                <!-- 如果至少有一个ai组件-->
                <div v-if="aiFuncs.some((item:any) => item.group === 'ai') && aiFuncs.some((item:any) => item.group === 'tool')" style="border-left: 1px solid #ddd; margin: 2px 5px;"></div>

                <template v-for="(item, i) of aiFuncs">
                    <el-dropdown v-if="item.group ==='tool' && item.children && item.children.length > 1" 
                        ai-ass-juge
                        trigger="hover"
                        :hide-timeout="100"
                        @command="(obj:any)=>{obj.click && obj.click(obj.e, obj.item)}">
                        <el-button size="small" text :icon="item.icon">{{ item.name }}</el-button>
                        <template #dropdown>
                            <el-dropdown-menu>
                                <el-dropdown-item 
                                    v-for="(child, j) of item.children" 
                                    ai-ass-juge
                                    :class="{'dropdown-highlight': child.highlight}"
                                    :icon="child.icon"
                                    :command="{e:null, item:child, click:child.click}">{{child.name}}
                                </el-dropdown-item>
                            </el-dropdown-menu>
                        </template>
                    </el-dropdown>
                    <el-button v-else-if="item.group === 'tool'" size="small" text :icon="item.icon">{{ item.name }}</el-button>
                </template>
            </div>
            <el-container class="anime-ai-assistant" v-loading="aiStates.loading">
                <el-main>
                    <!-- 横线 -->
                    <div v-show="aiStates.showContent" style="border-top: 1px solid #ddd; margin: 2px 0px;"></div>
                    <div class="ai-assistant-content anime-ai-assistant-fast" :style="{'width': aiStates.width, 'height': aiStates.height}" >
                        <div class="ai-assistant-content-inner">
                            <div v-show="aiStates.showContentColorSet" ai-ass-juge>
                                <div class="ai-color-title">字体颜色</div>
                                <div class="color-container">
                                    <el-button 
                                        v-for="(item, i) in colorCommands.color" 
                                        size="small" 
                                        :icon="item.icon" 
                                        :style="{color:item.value as string}"
                                        @click="(e:Event)=>item.click(e, item)">
                                        
                                    </el-button>
                                </div>
                                <div class="ai-color-title">背景颜色</div>
                                <div class="background-container">
                                    <el-button 
                                        v-for="(item, i) in colorCommands.backgroundColor" 
                                        size="small" 
                                        :color="(item.value as string)"
                                        @click="(e:Event)=>item.click(e, item)">
                                    </el-button>
                                </div>
                            </div>

                            <div v-show="aiStates.showContentLink">
                                <div class="toolbar-form-link" ai-ass-juge>
                                    <input
                                        ai-ass-juge
                                        v-model="editLink"
                                        style="border:none;outline:none;border-right:1px solid #e4e7ed;font-size:12px;"
                                        placeholder="请输入链接"
                                    />
                                    <div class="toolbar-link-button-group">
                                        <el-tooltip :show-after="800" effect="dark" content="保存"placement="bottom"><div class="link-button" @click="executeSetLink(editLink)"><el-icon :size="14"><SaveIcon/></el-icon></div></el-tooltip>
                                        <el-tooltip :show-after="800" effect="dark" content="取消链接"placement="bottom"><div class="link-button" @click="editLink=''; executeSetLink(editLink)"><el-icon :size="14"><UnlinkIcon/></el-icon></div></el-tooltip>
                                    </div>
                                </div>
                            </div>

                            <div v-show="aiStates.showContentAITalk">
                                <div class="assistant-ai-talk" ai-ass-juge contenteditable="true">
                                    <div ref="aiTalkContentRef" class="assistant-ai-talk-content" contenteditable="false">
                                        <template v-for="(item, i) of aiTalkHistory">
                                            <div v-if="item.role==='user'" class="user-msg">
                                                <div class="user-msg-content" v-text="item.content"></div>
                                                <div class="user-msg-opt">
                                                    <el-button v-if="item?.replaceClick" text size="small" @click="(e:Event)=>item.replaceClick && item.replaceClick(e)">替换选中</el-button>
                                                    <el-button v-if="item?.appendClick" text size="small" @click="(e:Event)=>item.appendClick && item.appendClick(e)">追加</el-button>
                                                    <el-button v-if="item?.copyClick" text size="small" @click="(e:Event)=>item.copyClick && item.copyClick(e)">复制</el-button>
                                                </div>
                                            </div>
                                            <div v-else class="ai-msg">
                                                <div class="ai-msg-content" v-text="item.content"></div>
                                                <div class="ai-msg-opt">
                                                    <el-button v-if="item?.replaceClick" text size="small" @click="(e:Event)=>item.replaceClick && item.replaceClick(e)">替换选中</el-button>
                                                    <el-button v-if="item?.appendClick" text size="small" @click="(e:Event)=>item.appendClick && item.appendClick(e)">追加</el-button>
                                                    <el-button v-if="item?.copyClick" text size="small" @click="(e:Event)=>item.copyClick && item.copyClick(e)">复制</el-button>
                                                </div>
                                            </div>
                                        </template>
                                        
                                    </div>
                                    <div class="assistant-ai-talk-input-group">
                                        <el-input @keydown.enter="sendAIMsg" v-model="aiInput" placeholder="请输入内容" size="small" style="width: 100%;"></el-input>
                                        <el-button @click="sendAIMsg" style="margin-left: 10px;" size="small">发送</el-button>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </el-main>
            </el-container>
        </el-card>
    </div>
    
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, PropType, computed } from 'vue';
import { AditorDocView } from 'vue-aditor'
import {
    aiTalkContentRef, aiAssistantRef
    , colorCommands, aiStates, aiTalkSessionList, selHook, aiFuncs, setLinkValue, executeSetLink, sendAIMsg
} from './AIAssistant'
import {
    Edit24Filled as SaveIcon
    , LinkDismiss24Filled as UnlinkIcon
} from '@vicons/fluent'

const props = defineProps({
    getAditorView: {
        // type: Object as PropType<{view:AditorDocView|null, setClock: number}>,
        type: Function as PropType<()=>AditorDocView|null>,
        required: true
  }
})

const editLink = computed({
    get: ()=>aiStates.value.linkValue,
    set: (value)=>{
        setLinkValue(value)
    }
})

const aiInput = computed({
    get: ()=>aiStates.value.aiInput,
    set: (value)=>{
        aiStates.value.aiInput = value
    }
})

const aiTalkHistory = computed({
    get: ()=>aiTalkSessionList.getCurrentSession(),
    set: (value)=>{
        
    }
})

const eventHook = (e: Event) =>{
    selHook(e, props.getAditorView)
}

onMounted(()=>{
    document.addEventListener('selectionchange', eventHook);
    document.addEventListener('keyup', eventHook);
    document.addEventListener('mouseup', eventHook);
});

onUnmounted(()=>{
    document.removeEventListener('selectionchange', eventHook);
    document.removeEventListener('keyup', eventHook);
    document.removeEventListener('mouseup', eventHook);
});
</script>
  
<style scoped>
/* 让ai-assistant元素改变位置时具有动画效果 */
.ai-assistant{
    position: absolute;
    top: 0px;
    left: 0px;
    z-index:2000;
    /* top,left改变动画效果 */
    transition: all 0.3s ease-in-out;
    font-size: 12px;
}
.ai-assistant :deep(.el-button+.el-button) {
    margin-left: 0px !important;
}
.ai-assistant-hide{
    display: none;
}
.ai-assistant button{
    font-size:12px;
}
.anime-ai-assistant{
    transition: all 0.5s ease-in-out;
}
.anime-ai-assistant-fast{
    transition: all 0.3s ease-in-out;
}

:deep(.dropdown-highlight){
    background-color:#ecf5ff !important;
    color: #409eff !important;
}
.ai-assistant-content{
    height: auto;
}
.ai-assistant-content-inner{
    padding: 5px 10px;
}
.ai-color-title{
    font-size: 12px;
    margin: 5px 0px;
    color:#303133;
}
.color-container{
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 5px; 
}

.color-container > .el-button {
    width: 50px;
    height: 24px;
}

.background-container{
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 3px; 
}
.background-container > .el-button {
    width: 28px;
    height: 24px;
    padding: 5px 11px;
}


/* 卡片样式，带阴影 */
.toolbar-form-link{
    border: 1px solid #e4e7ed;
    padding: 5px 6px;
    width: auto;
    height: 22px;
    background-color: #fff;
    border-radius: 4px;
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    transition: top 0s ease-in-out, left 0s ease-in-out;
}
.toolbar-form-link input{
    min-width: 30px;
    flex: 1;
}

.toolbar-link-button-group{
    display: flex;
    justify-content: flex-start;
    width: 80px;
}
.link-button{
    margin-left: 4px;
    display: flex;
    padding: 4px 10px;
    cursor: pointer;
} 
.link-button:hover{
    background-color: #f5f7fa;
}


/* 聊天样式 */
.assistant-ai-talk {
    display: flex;
    flex-direction: column;
    width: 100%;
    outline: none;
}

.assistant-ai-talk-content {
    display: flex;
    flex-direction: column;
    width: calc(100% - 10px);
    padding: 10px;
    max-height: 520px;
    overflow: auto;
    /* 保证中英文正常换行 */
    word-break: break-all;
    word-wrap: break-word;
    white-space: pre-wrap;
}

.user-msg, .ai-msg {
    display: flex;
    flex-direction: column;
    margin-bottom: 10px;
}

.user-msg-content, .ai-msg-content {
    padding: 10px;
    border-radius: 5px;
    font-size: 14px;
    line-height: 1.5;
}

.user-msg-content {
    align-self: flex-end;
    background-color: #4CAF50; /* 微信绿色 */
    color: white;
}

.ai-msg-content {
    align-self: flex-start;
    background-color: #f0f0f0; /* 浅灰色 */
    color: black;
}

.user-msg-opt, .ai-msg-opt {
    display: flex;
    margin-top: 5px;
}
.user-msg-opt{
    justify-content: flex-end;
}
.ai-msg-opt{
    justify-content: flex-start;
}

.assistant-ai-talk-input-group {
    display: flex;
    justify-content: space-between;
    width: 100%;
    margin: 10px 0px;
}

</style>