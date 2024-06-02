<script setup lang="ts">
import { docStruct, renderAditorFromJSON, AditorDocView, createAditorNode } from 'vue-aditor'
import 'vue-aditor/dist/style.css'

import { PropType } from 'vue'
const props = defineProps({
  docJson: {
    type: Object as PropType<docStruct|undefined>,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  setAditorViews: {
    type: Function as PropType<(path:string, aditorView: AditorDocView)=>void>,
    required: true
  },
  updateFile:{
    type: Function as PropType<(view: AditorDocView)=>void>,
    required: true
  }
})
let aditorView: AditorDocView|null = null

try{
  aditorView = renderAditorFromJSON(props.docJson)
  aditorView.bindStringResource2NodeCallback((view, data, name, size, type)=>{
    if(type === 'application/pdf'){
      return createAditorNode('aditorPDF', {}, {name, size, href: data})
    }
    return null
  })
  props.setAditorViews(props.path, aditorView)
}catch(e){
  // 如果错误消息里面信息类似"Component ${name} is not registered"
  // 说明aditorView里面有未注册的组件
  if((e as Error).message.includes('Component')){
    // 匹配出未注册的组件名称
    const componentName = (e as Error).message.match(/Component (.*) is not registered/)?.[1]
    const logMsg = "你打开的文件需要安装"+componentName+"组件才能正常使用,请安装有该组件的Egbenz版本"
    ElMessage({
        showClose: true,
        duration:0,
        message: logMsg,
        type: 'warning',
    })
  }
}

</script>

<template>
  <div class="editor-main">
    <component @save="updateFile" ref="aditorRef" v-if="aditorView && aditorView.vNode" :is="aditorView.vNode"></component>
  </div>
</template>

<style scoped>
.editor-main {
  min-width: 680px;
  max-width: 1200px;
  background-color: #fff;
  padding: 0px 40px;
  position: absolute;
}

/* 自动换行 */
.editor-main :deep(span){
  word-break: break-all;
  word-wrap: break-word;
}

</style>
