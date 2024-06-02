<template>
    <div class="aditor-quote" :style="aNode.style">
        <slot></slot><br v-if="aNode.children.length == 1 && aNode.children[0].length() == 0" />
    </div>
</template>
    
<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { AditorDocView, ANodeType, StyleNameEnum, ExportNodeConfig, AditorNode } from 'vue-aditor'

const config: ExportNodeConfig = {
    secondaryType: ANodeType.Child,
    validStyleList: [
        StyleNameEnum.textAlign
    ]
}

export default defineComponent({
    name: 'aditorQuote',
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
    setup() {
        return {
        }
    },
    config
})
</script>
  
<style scoped>
/* markdown引用效果背景 */
.aditor-quote{
    background-color: #f5f5f5;
    padding: 10px;
    border-left: 5px solid #d0e5f2;
    margin: 10px 0;
    border-radius: 5px;
}
</style>