<script setup lang="ts">
import { ref } from 'vue';
import { Document, DocumentAdd, FolderAdd, RefreshLeft } from '@element-plus/icons-vue';
import Contextmenu from './Contextmenu.vue';
import ExplorerState from './Explorer'
import { defaultProps } from './Explorer'
import { onMounted, reactive } from 'vue';

const elTreeRef = ref()
const contextmenuRef = ref()
const dialogState = reactive({
  dialogInputVisible: false,
  dialogInputString: "",
  dialogClickCallback: ExplorerState.newFolder,
  dialogTitle: "新建文件夹"
})
const dialogClick = async (name: string)=>{
  const result = await dialogState.dialogClickCallback(name) 
  if (result) {
    dialogState.dialogInputVisible = false
  }
}

const showContextMenu = (e: MouseEvent,_:any,node:any) => {
  contextmenuRef.value.clickButtonManual(e)
  ExplorerState.updateContextMenuNode(node)
}


const showDialog = (type: string) => {
  // 如果在根目录下，无动作
  if( elTreeRef.value && elTreeRef.value?.getCurrentKey() == null){
    return
  }

  if (type === 'newFolder') {
    dialogState.dialogClickCallback = ExplorerState.newFolder
    dialogState.dialogInputString = ""
    dialogState.dialogTitle = "新建文件夹"
  } else if (type === 'newFile') {
    dialogState.dialogClickCallback = ExplorerState.newFile
    dialogState.dialogInputString = ""
    dialogState.dialogTitle = "新建文件"
  } else if(type === 'delete'){
    dialogState.dialogClickCallback = ()=>ExplorerState.deletePath(ExplorerState.state.lastContextMenuNode)
    dialogState.dialogInputString = ""
    dialogState.dialogTitle = "确认删除文件?"
  } else if(type === 'rename'){
    dialogState.dialogClickCallback = (name:string)=>ExplorerState.renamePath(ExplorerState.state.lastContextMenuNode, name)
    dialogState.dialogInputString = ExplorerState.state.lastContextMenuNode.label
    dialogState.dialogTitle = "重命名"
  } else {
    return
  }
  dialogState.dialogInputVisible = true
}


onMounted(() => {
  ExplorerState.mountElTreeRef(elTreeRef.value)
})

</script>

<template>
  <div class="explorer-body">
    <Contextmenu ref="contextmenuRef"
      @delete-path="showDialog('delete')"
      @rename-path="showDialog('rename')"
    />
    <div class="exporer-head">
      <span class="head-content">Egbenz</span>
      <span class="head-options">
        <el-button-group>
          <el-button :size="'small'" :icon="DocumentAdd" @click="showDialog('newFile')" />
          <el-button :size="'small'" :icon="FolderAdd" @click="showDialog('newFolder')" />
          <el-button :size="'small'" :icon="RefreshLeft" @click="ExplorerState.refreshFolder" />
        </el-button-group>
      </span>
    </div>

    <div class="exporer-content">
      <el-scrollbar>
        <el-tree ref="elTreeRef" lazy auto-expand-parent highlight-current node-key="path" :indent="8"
          :props="defaultProps" :load="ExplorerState.loadNode"
          @node-contextmenu="showContextMenu"
          @node-click="ExplorerState.nodeClickHandler">
          <template #default="{ node, data }">
            <span class="custom-tree-node">
              <el-icon v-if="data.isLeaf" size="14px" style="margin-right: 5px; margin-left: -18px;">
                <Document />
              </el-icon>
              <span>{{ node.label }}</span>
            </span>
          </template>
        </el-tree>
      </el-scrollbar>
    </div>

    <el-dialog v-model="dialogState.dialogInputVisible" :title="dialogState.dialogTitle">
      <div>
        <div v-show="dialogState.dialogTitle != '确认删除文件?'" style="margin-bottom: 10px;">
          <el-input v-model="dialogState.dialogInputString" />
        </div>
        <div style="display: flex; justify-content: flex-end;">
          <el-button type="primary" @click="dialogClick(dialogState.dialogInputString)">确认</el-button>
          <el-button @click="dialogState.dialogInputVisible=false">取消</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.explorer-body {
  border-right: 1px solid var(--e-border-color);

  /* width: 100%;
  height: 100vh;
  overflow: auto;
  border-right: 1px solid var(--e-border-color);
  box-shadow: var(--e-box-shadow-right); */
}

.exporer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 55px;
}

.exporer-head .head-content {
  margin-left: 20px;
}

.exporer-head .head-options {
  margin-right: 20px;
}

.custom-tree-node {
  flex: 1;
  display: flex;
  align-items: center;
  font-size: 14px;
  padding-right: 8px;
}

.exporer-content {
  height: calc(100vh - 56px);
  overflow: auto;
  border-top: 1px solid var(--e-border-color);
  box-shadow: var(--e-box-shadow-top);
}
</style>
