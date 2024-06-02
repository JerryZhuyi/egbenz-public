<template>
    <div class="aditor-audio">
        <audio controls :src="aNode.data.src"></audio>
    </div>
</template>

<script lang="ts">
import { defineComponent, PropType, computed } from 'vue'
import { AditorDocView,ANodeType,ExportNodeConfig,AditorNode } from 'vue-aditor'

const config:ExportNodeConfig = {
    secondaryType: ANodeType.BlockLeaf,
    dataKeyName: 'src',
    validStyleList: [
    ],
}


export default defineComponent({
    name: 'aditorAudio',
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
        const selOffsetCor = computed(() => {
            if (props.aNode.length() == 0) {
                return 1
            }
            return 0
        })

        return {
            selOffsetCor
        }
    },
    config
})
</script>
<style scoped>
.aditor-audio{
}
</style>