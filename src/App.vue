<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Explorer from './components/Explorer.vue';
import explorerState from './components/Explorer.ts'
import Breadcrumb from './components/Breadcrumb.vue';
import Editor from './components/Editor.vue';
import EditorToolbar from './components/EditorToolbarUpgrade.vue';
import Progress from './components/Progress.vue';
import AIAssistant from './components/AIAssistant.vue';
import { AditorDocView, aditorLogger } from 'vue-aditor'
import { globalState } from './global-state.ts';

// set logger ignore level, 0=all, 1=ignore debug, 2=ignore debug and info
aditorLogger.setLevel(2)

const contentRef = ref<HTMLElement | null>()
const contentEditRefList = ref<HTMLElement[]>([])
const toolBarRef = ref(null)
const aditorViews: { [path: string]: AditorDocView } = {}

const setAditorViews = (path: string, aditorView: AditorDocView) => {
  aditorViews[path] = aditorView
  aditorView.bindViewEventHook('afterUpdateState', (_state, newState) => explorerState.afterUpdateView(path, newState))
}

const getActiveItemView = () => {
  const activePath = explorerState.openedNodePath.value
  return aditorViews[activePath]
}

const setContentEditRefList = (el:HTMLElement, index:number) => {
  if (contentEditRefList.value[index]) {
    contentEditRefList.value[index] = el
  } else {
    contentEditRefList.value.push(el)
  }
}

const scroll2Keydown = (i:number) => {
  const container = contentEditRefList.value[i]
  if (!container) return;

  let selection = window.getSelection();
  if (!selection?.rangeCount) return;

  let rect = selection.getRangeAt(0).getBoundingClientRect();
  // 获得浏览器高度
  let clientHeight = document.documentElement.clientHeight;
  // 如果rect.top大于clientHeight，说明已经超出了可视区域
  if (rect.top > (clientHeight - 81)) {
    // 滚动到rect.top位置
    container.scrollTop = container.scrollHeight;
  }
}

onMounted(() => {
  // if (contentRef.value) {
  //   contentRef.value.style.width = `${globalState.canvasFitWidth}px`
  // }
})

</script>

<template>
  <div class="app">
    <el-container class="layout-container-demo" >
      <el-aside :width="globalState.asideWidth+'px'">
        <el-scrollbar>
          <explorer></explorer>
        </el-scrollbar>
      </el-aside>

      <el-container style="width:100%">
        <el-main>
          <div v-show="explorerState.openedNodePath.value && explorerState.openedNodePath.value.length > 0" ref="contentRef" class="content">
            <el-tabs v-model="explorerState.openedNodePath.value" type="card" closable
              @tab-remove="explorerState.closeOpenedDoc">
              <el-tab-pane v-for="(item, i) in explorerState.state.openedNodes" :key="item.data.path"
                :label="(item.data.isChanged ? '*' : '') + item.data.label" :name="item.data.path">
                <div class="content-main">
                  <div class="breadcrumb">
                    <breadcrumb :openedNodePath="explorerState.openedNodePath.value"></breadcrumb>
                  </div>
                  <div :ref="(el)=>setContentEditRefList(el as HTMLElement, i)" class="content-main-editor" @keydown="scroll2Keydown(i)">
                    <editor v-if="item.data.docJson" :docJson="item.data.docJson" :path="item.data.path"
                      :setAditorViews="setAditorViews" :updateFile="(view: AditorDocView) => explorerState.updateFile(item.data.path, view)">
                    </editor>
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
            <!-- <editor-toolbar :getAditorView="getActiveItemView" ref="toolBarRef"></editor-toolbar> -->
          </div>
          <div v-show="explorerState.openedNodePath.value == null || explorerState.openedNodePath.value.length == 0" class="content-empty">
            Welcome
          </div>
        </el-main>
      </el-container>
    </el-container>
    <Progress></Progress>
    <AIAssistant :getAditorView="getActiveItemView"></AIAssistant>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100vh;
}
.content {
  flex: 4;
}

.layout-container-demo :deep(.el-main){
  padding: 0px;
}

.content :deep(.el-tabs) {
  --el-tabs-header-height: 30px;
}
.content :deep(.el-tabs .el-tabs__content) {
  height: calc(100vh - 41px);
}

.content :deep(.el-tabs__header) {
  margin: 0;
  background-color: #fff;
}
/* 第一个tab没有左边框 */
.content :deep(.el-tabs--card .el-tabs__header .el-tabs__nav:first-child) {
  border-left: none;
}


.breadcrumb {
  padding: 6px 15px;
  border-bottom: 1px solid var(--e-border-color);
  position: relative;
}
.breadcrumb :deep(.el-breadcrumb) {
  font-size: 12px;
}
.content-main-editor {
  height: calc(100vh - 91px);
  padding: 5px 15px;
  overflow-y: auto;
  overflow-x: auto;
  position: relative;
}

.content-empty{
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  font-size: 36px;
  color: #ccc;
  width:100%;

}

</style>