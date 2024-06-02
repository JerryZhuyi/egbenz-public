<script setup lang="ts">
import { ref, onMounted, computed, PropType } from 'vue'
import view from './EditorToolbar.ts'
import { TOOLBAR_TYPE } from './EditorToolbar.ts'
import { ArrowDown } from '@element-plus/icons-vue'
import {
    GridDots20Filled as GirdIcon
    , TextColor16Regular as ColorIcon
    , TextEffects24Filled as TextColorIcon
    , Link16Regular as LinkIcon
    , Edit24Filled as SaveIcon
    , LinkDismiss24Filled as UnlinkIcon
} from '@vicons/fluent'
import {AditorDocView} from 'vue-aditor'

const props = defineProps({
    getAditorView: {
    // type: Object as PropType<{view:AditorDocView|null, setClock: number}>,
    type: Function as PropType<()=>AditorDocView|null>,
    required: true
  }
})

const visible = computed(
    ()=>view.state.displayState === 'show'
)

const placement = computed(() => {
    if(view.state.type === 'prefix'){
        return 'left-start'
    }else if(view.state.type === 'command'){
        return 'top'
    }else{
        return 'top'
    }
})

const editLink = computed({
    get: ()=>view.state.attrs.linkValue,
    set: (value)=>{
        view.setLinkValue(value)
    }
})

const containerRef = ref(null)
const form1Ref = ref(null)
const form2Ref = ref(null)
const form2ButtonRef = ref(null)

const toolbarButtonRef = ref(null)
const toolbarRef = ref(null)

const colorButtonRef = ref(null)
const colorPopoverRef = ref(null)
const colorContentRef = ref(null)

const toolbarHTMLElements = ()=>{
    return [
        (form1Ref.value as any)?.$el
        , (form2Ref.value as any)
        , (colorContentRef.value as any)?.$el
        , (form2ButtonRef.value as any)?.$el
        , (colorButtonRef.value as any)?.$el
    ]
}
const getContainer = ()=>{
    return (toolbarButtonRef.value as any)?.$el
}
const getPrefixIsShow = ()=>{
    // 判断prefixRef是否有值，然后获取其绑定的el对象的display属性
    if(form2Ref.value){
        const parentEl = (form2Ref.value as any).parentElement
        if(parentEl){
            return parentEl.style.display !== 'none'
        }
    }
    return false
}

const getButtonStyle = computed(()=>{
    return {
        visibility: 'hidden',
        zIndex: 100,
        position: 'absolute',
        left: view.state.position.x + 'px',
        top: view.state.position.y + 'px'
    }
})

onMounted(()=>{
    view.init(props.getAditorView, toolbarHTMLElements, getContainer, getPrefixIsShow)
})

</script>

<template>
    <div ref="containerRef">
        <el-button ref="toolbarButtonRef" v-popover="toolbarRef" :style="getButtonStyle" class="toolbar-button"></el-button>
        <el-popover
            :visible="visible"
            ref="toolbarRef"
            trigger="click"
            virtual-triggering
            width="auto"
            :placement="placement"
            :show-arrow="false"
            :hide-after="0"
            :show-after="0"
            popper-style="padding:0px;min-width:20px"
            @before-enter="view.beforeEnter"
            @after-enter="view.afterEnter"
            @before-leave="view.beforeLeave" 
            @after-leave="view.afterLeave" 
        >
            <!-- form 1 -->
            <el-card ref="form1Ref" shadow="never" body-style="border:none" v-show="view.state.type === 'command'" class="toolbar-form-1">
                <el-space wrap :size="0" class="toolbar-space">
                    <template v-for="(item, i) in view.commands()" :key="i">
                        <el-dropdown @command="item.execute" v-if="item.children && item.children.length > 0" trigger="click">
                            <el-button size="small" text>
                                <el-icon>
                                    <component :is="item.icon"></component>
                                </el-icon>
                                <el-icon class="el-icon--right"><arrow-down /></el-icon>
                            </el-button>
                            <template #dropdown>
                                <el-dropdown-menu>
                                    <el-dropdown-item v-for="(child, _) in item.children"
                                        e-boundary="toolbar" :icon="child.icon" 
                                        style="font-size:12px;"
                                        :command="{key: child.name, value: child.value }"
                                        :class="{ 'toolbar-item-selected': child.highlight }"
                                    ><div>{{ child.label }}</div></el-dropdown-item>
                                </el-dropdown-menu>
                            </template>
                        </el-dropdown>

                        <div @click="item.execute({key: item.name, value: item.value})" class="item-container" :class="{ 'toolbar-item-selected': item.highlight }" v-else-if="item.name !== 'color'">
                            <div class="item-container-icon">
                                <el-icon>
                                    <component :is="item.icon"></component>
                                </el-icon>
                            </div>
                            <div class="item-container-text">{{ item.label }}</div>
                        </div>
                        
                        <el-divider style="margin:0px;padding:0px" v-if="i != view.commands().length - 1" direction="vertical" />
                    </template>

                    <el-divider style="margin:0px;padding:0px" direction="vertical" />
                    
                    <!-- color command is single -->
                    <div class="item-container" :style="{ backgroundColor: view.backgroundColor() }" ref="colorButtonRef" @click="view.clickColorButton">
                        <el-icon :color=" view.fontColor()"><ColorIcon></ColorIcon></el-icon>
                    </div>

                    <el-divider style="margin:0px;padding:0px" direction="vertical" />
                    <div class="item-container" ref="linkButtonRef" @click="()=>{view.setStateType(TOOLBAR_TYPE.link)}">
                        <el-icon><LinkIcon></LinkIcon></el-icon>
                    </div>

                    <el-popover
                        ref="colorPopoverRef"
                        :virtual-ref="colorButtonRef"
                        virtual-triggering
                        :width="320"
                        popper-style="padding:0px;"
                        :visible="view.state.colorVisible"
                    >
                        <el-space style="padding:12px;" @mousedown.stop.prevent ref="colorContentRef" direction="vertical" alignment="left">
                            <div>字体颜色</div>
                            <div>
                            <el-row :gutter="0" style="width:300px;">
                                <el-col v-for="(item, key) in view.colorCommands" :key="key" :span="3">
                                <el-button @click="item.execute({key: item.name, value:item.value})" size="small">
                                    <el-icon :size="10" :color="(item.value as string)">
                                    <TextColorIcon />
                                    </el-icon>
                                </el-button>
                                </el-col>
                            </el-row>
                            </div>
                            <div>背景颜色</div>
                            <div>
                            <el-row :gutter="0" style="width:300px;">
                                <el-col v-for="(item, key) in view.backgroundColorCommands" :key="key" :span="3" style="padding-bottom: 3px;">
                                <el-button
                                    @click="item.execute({key: item.name, value:item.value})"
                                    size="small" :color="(item.value as string)">
                                    <el-icon :size="8">
                                    </el-icon>
                                </el-button>
                                </el-col>
                            </el-row>
                            </div>
                        </el-space>
                    </el-popover>

                </el-space>
            </el-card>

            <!-- form 2 -->
            <el-popover placement="left-start" :width="216"
                :visible="view.state.prefixMenuVisible"
                :hide-after="0"
            >
                <div ref="form2Ref" style="width:190px;">
                    <el-space wrap>
                        <div style="width:190px">样式</div>
                        <template v-for="(item, _) in view.commands()" >
                            <div
                                @click="item.execute({key: item.name, value:item.value, setSelection: false})"
                                v-if="item.type === 'style'" class="item-container-form2" :class="{ 'toolbar-item-selected': item.highlight }">
                                <el-icon>
                                    <component :is="item.icon"></component>
                                </el-icon>
                            </div>
                        </template>
                        <div style="width:190px">操作</div>

                        <template v-for="(item, _) in view.commands()">
                            <div
                                @click="(form2ButtonRef as any)?.$el?.click();item.execute({key: item.name, value:item.value, setSelection: false})" 
                                v-if="item.type === 'operate'" style="width:190px">
                                <div class="operate-row">
                                    <el-icon :size="18">
                                        <component :is="item.icon"></component>
                                    </el-icon>
                                    <div style="margin-left: 20px;line-height: 18px;">{{ item.label }}</div>
                                </div>
                            </div>
                        </template>
                        <div style="width:190px">插入</div>
                        <template v-for="(item, _) in view.commands()">
                            <div
                                @click="(form2ButtonRef as any)?.$el?.click();item.execute({key: 'insert_node', value:item.value, setSelection: false})" 
                                v-if="item.type === 'add'" style="width:190px">
                                <div class="add-row">
                                    <el-icon :size="18">
                                        <component :is="item.icon"></component>
                                    </el-icon>
                                    <div style="margin-left: 20px;line-height: 18px;">{{ item.label }}</div>
                                </div>
                            </div>
                        </template>
                    </el-space> 
                </div>
                <template #reference>
                    <el-button 
                        ref="form2ButtonRef"
                        e-boundary="toolbar"
                        v-show="view.state.type === 'prefix'" text 
                        style="height: auto; padding:6px 8px" 
                        type="success"
                        @click="view.clickPrefixButton"
                    >
                        <el-icon e-boundary="toolbar">
                            <GirdIcon e-boundary="toolbar"></GirdIcon>
                        </el-icon>
                    </el-button>
                </template>
            </el-popover>

            <!-- form3: link -->
            <div class="toolbar-form-link" v-show="view.state.type === TOOLBAR_TYPE.link" e-boundary="toolbar">
                <input
                    v-model="editLink"
                    style="width: 240px; border:none;outline:none;border-right:1px solid #e4e7ed;font-size:12px;"
                    placeholder="请输入链接"
                />
                <div class="toolbar-link-button-group">
                    <el-tooltip :show-after="800" effect="dark" content="保存"placement="bottom"><div @click="view.executeSetLink" class="link-button"><el-icon :size="14"><SaveIcon/></el-icon></div></el-tooltip>
                    <el-tooltip :show-after="800" effect="dark" content="取消链接"placement="bottom"><div @click="()=>{view.setLinkValue(''); view.executeSetLink()}" class="link-button"><el-icon :size="14"><UnlinkIcon/></el-icon></div></el-tooltip>
                </div>
            </div>
        </el-popover>
    </div>
</template>


<style scoped>
.toolbar-container {
}
.toolbar-form-1 {}

.toolbar-button{
    visibility: hidden;
    transition: top 0s ease-in-out, left 0s ease-in-out;
}
.toolbar-form-1 :deep(.el-card__body) {
    padding: 6px 6px;
}

.toolbar-space :deep(.el-space__item) {
    margin-right: 2px !important;
    margin-left: 2px !important;
    padding-left: 0px !important;
    padding-right: 0px !important;
    padding-bottom: 0px !important;
    padding-top: 0px !important;
}

.item-container {
    min-width: 20px;
    line-height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px 8px;
    cursor: pointer;
    font-size:12px;
}
.item-container-icon {
    margin-right: 4px;
    height: 12px;
}

.item-container-form2{
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 8px;
    cursor: pointer;
}

.item-container:hover {
    background-color: #ebeef5;
}
.item-container-form2:hover{
    background-color: #ebeef5;
}

:deep(.toolbar-item-selected) {
    background-color: var(--el-color-primary-light-9) !important;
}

:deep(.toolbar-item-selected:hover) {
    background-color: var(--el-color-primary-light-8) !important;
}

.operate-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 6px 4px;
    cursor: pointer;
}
.operate-row:hover{
    background-color: #ebeef5;
}


.add-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 6px 4px;
    cursor: pointer;
}
.add-row:hover{
    background-color: #ebeef5;
}

/* 卡片样式，带阴影 */
.toolbar-form-link{
    padding: 10px 12px;
    width: auto;
    height: 22px;
    background-color: #fff;
    box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1);
    border-radius: 4px;
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    transition: top 0s ease-in-out, left 0s ease-in-out;
}

.toolbar-link-button-group{
    display: flex;
    justify-content: flex-start;
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

</style>
