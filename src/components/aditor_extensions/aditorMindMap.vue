<template>
  <div class="mindmap_container" aditor-ignore-event contenteditable="false">
    <div ref="jmContainer" class="jsmind-container"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, PropType, ref, toRaw, watch } from 'vue'
import { AditorDocView, ANodeType, ExportNodeConfig, AditorNode, dispatchUpdateData } from 'vue-aditor'
import 'jsmind/style/jsmind.css'
import 'jsmind/draggable-node';
import jsMind from 'jsmind'

const config: ExportNodeConfig = {
  secondaryType: ANodeType.BlockLeaf,
  dataKeyName: 'src',
  defaultData: {
    meta: {
      name: 'example',
      author: 'egbenz',
      version: '0.1',
    },
    format: 'node_array',
    data: [
      { id: 'root', isroot: true, topic: 'MindMap' },
    ]
  },
  validStyleList: [
  ],
}

export default defineComponent({
  name: 'aditorMindMap',
  components: {

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
    const jmContainer = ref<HTMLDivElement | null>(null)
    let jmTimer: NodeJS.Timeout | null = null
    const init = () => {
      const options = {
        container: jmContainer.value,
        editable: true,
        theme: 'custom',
        view: {
            engine: 'canvas',
            draggable: true, // 启用拖动画布功能
            hide_scrollbars_when_draggable: true // 启用拖动时隐藏滚动条
        },
        shortcut: {
            enable: true, // 是否启用快捷键
            handles: {
            }, // 命名的快捷键事件处理程序
            mapping: { // 快捷键映射
                addchild: [45, 4096 + 13], // <Insert>, <Ctrl> + <Enter>
                addbrother: 13, // <Enter>
                editnode: 113, // <F2>
                delnode: 46, // <Delete>
                toggle: 32, // <Space>
                left: 37, // <Left>
                up: 38, // <Up>
                right: 39, // <Right>
                down: 40, // <Down>
            }
        },
      }
      const mind = toRaw(props.aNode.data)
      const jm = new jsMind(options)
      jm.show(mind)
      jm.add_event_listener((type:number, data:{evt?:string, data:[], node?:string})=>{
        if(type === 3){
          if (jmTimer) {
            clearTimeout(jmTimer)
          }
          jmTimer = setTimeout(() => {
            let mind_data = jm.get_data();
            dispatchUpdateData(props.docView, props.aNode.start, Object.assign(props.aNode.data, mind_data))
          }, 500)
          
        }
      })

    }
    onMounted(() => {
      init()
    })
    return {
      jmContainer
    }
  },
  config
})

</script>

<style scoped>
.mindmap_container {
  width: 100%;
  height: 600px;
  border: 1px solid #ccc;
  background-color: #ffffff;

}

:deep(.jsmind-container) {
  width: 100%;
  height: 100%;
}

:deep(jmnodes.theme-custom jmnode) {
  background-color: #ffffff !important;
  border-radius: 4px !important;
  border: 1px solid #e5e5e5 !important;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1) !important;
  font-family: 'Arial', sans-serif !important;
  color: #333333 !important;
}

/* 节点样式 */
:deep(jmnodes.theme-custom jmnode:hover) {
  background-color: #f0f0f0 !important;
}

/* 鼠标悬停的节点样式 */
:deep(jmnodes.theme-custom jmnode.selected) {
  border: 2px solid #007bff !important;
}

/* 选中的节点样式 */
:deep(jmnodes.theme-custom jmnode.root) {
  font-size: 18px !important;
  padding-left: 16px !important;
  padding-right: 16px !important;

}

/* 根节点样式 */
:deep(jmnodes.theme-custom jmexpander) {

}

/* 展开/关闭节点的控制点样式 */
:deep(jmnodes.theme-custom jmexpander:hover) {}

/* 鼠标悬停展开/关闭节点的控制点样式 */

/* 输入框样式 */
:deep(.jsmind-container input) {
  border-radius: 4px !important;
  padding: 8px 8px !important;
  font-family: 'Arial', sans-serif !important;
  font-size: 14px !important;
  color: #333333 !important;
  outline: none !important;
  border: none;
}

:deep(.jsmind-container input:focus) {
  outline: none !important;
}
</style>