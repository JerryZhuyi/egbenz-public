<template>
  <div ref="editor" aditor-ignore-event contenteditable="false">
    <codemirror
      v-model="code"
      :extensions="extensions"
    ></codemirror>
  </div>
</template>

<script lang="ts">
import { onMounted, ref, reactive } from 'vue';
import { Codemirror } from 'vue-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { sql } from '@codemirror/lang-sql';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';

import { defineComponent, PropType, computed } from 'vue'
import { AditorDocView,ANodeType,ExportNodeConfig,AditorNode,dispatchUpdateData } from 'vue-aditor'

const config:ExportNodeConfig = {
    secondaryType: ANodeType.BlockLeaf,
    dataKeyName: 'text',
    validStyleList: [
    ],
}

export default defineComponent({
    name: 'aditorCode',
    components: {
        Codemirror
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
        // 设置定时器更新code和language
        let codeTimer: NodeJS.Timeout | null = null
        let languageTimer: NodeJS.Timeout | null = null

        const code = computed({
          get: () => props.aNode.data.code,
          set: (val) => {
            if (codeTimer) {
              clearTimeout(codeTimer)
            }
            codeTimer = setTimeout(() => {
              dispatchUpdateData(props.docView, props.aNode.start, Object.assign(props.aNode.data, {code: val}) )
            }, 500)
          }
        })
        const language = computed({
          get: () => props.aNode.data.language,
          set: (val) => {
            if (languageTimer) {
              clearTimeout(languageTimer)
            }
            languageTimer = setTimeout(() => {
              dispatchUpdateData(props.docView, props.aNode.start, Object.assign(props.aNode.data, {language: val}) )
            }, 500)
          }
        })
        const editor = ref(null);

        const langCodeMap = reactive(new Map<string, { code: string; language: () => any }>())
        langCodeMap.set('javascript', { code: "", language: javascript })
        langCodeMap.set('python', { code: "", language: python })
        langCodeMap.set('html', { code: "", language: html })
        langCodeMap.set('sql', { code: "", language: sql })
        langCodeMap.set('json', { code: "", language: json })
        const currentLangCode = computed(() => langCodeMap.get(language.value)!)


        const extensions = computed(() => {
          const result = []
          if (currentLangCode.value) {
            result.push(currentLangCode.value.language())
          }
          return result
        })

        onMounted(() => {

        })


        return {
          editor,
          code,
          extensions
        }
    },
    config
})

</script>

<style scoped>
</style>