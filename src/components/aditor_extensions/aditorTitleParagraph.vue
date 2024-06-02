<template>
  <div :class="`aditor-title-${titleLevel}`" :style="aNode.style" :selstart="selStart" :seloffsetcor="selOffsetCor"><slot></slot><br :selstart="selStart" v-if="aNode.children.length == 1 && aNode.children[0].length() == 0" /></div>
</template>

<script lang="ts">
import { defineComponent, PropType, computed } from 'vue'
import { AditorDocView,ANodeType,ExportNodeConfig,AditorNode } from 'vue-aditor'

const config:ExportNodeConfig = {
    secondaryType: ANodeType.Child,
    dataKeyName: 'content',
    validStyleList: [
    ],
}

export default defineComponent({
  name: 'aditorTitleParagraph',
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
    const selStart = computed(() => {
      if(props.aNode.children.length > 0){
        if(props.aNode.children[0].length() == 0){
          return props.aNode.children[0].start
        }
      }
      return props.aNode.start
    })

    const selOffsetCor = computed(()=>{
      if(props.aNode.children.length > 0){
        if(props.aNode.children[0].length() == 0){
          return 3
        }
      }
      return 0
    })

    const titleLevel = computed(()=>{
      if(props.aNode.data.level == undefined){
        return '1'
      }
      return props.aNode.data.level
    })

    return {
      selStart,
      selOffsetCor,
      titleLevel
    }
  },

  config
})
</script>

<style scoped>
.aditor-title-1{
  font-weight: bold!important;
  font-size: 26px!important;
}

.aditor-title-2{
  font-weight: bold!important;
  font-size: 22px!important;
}

.aditor-title-3{
  font-weight: bold!important;
  font-size: 20px!important;
}

.aditor-title-4{
  font-weight: bold!important;
  font-size: 18px!important;
}

.aditor-title-5{
  font-weight: bold!important;
  font-size: 16px!important;
}
.aditor-title-6{
  font-weight: bold!important;
  font-size: 16px!important;
}
.aditor-title-7{
  font-weight: bold!important;
  font-size: 16px!important;
}

</style>