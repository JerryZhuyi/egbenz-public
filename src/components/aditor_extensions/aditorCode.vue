<template>
  <div ref="editor" aditor-ignore-event contenteditable="false">
    <codemirror
      v-model="code"
      :extensions="extensions"
      @ready="handleReady"
    ></codemirror>
  </div>
</template>

<script lang="ts">
import { onMounted, onUnmounted, ref, reactive, getCurrentInstance, shallowRef } from 'vue';
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
    defaultData:{
      language:"python",
      code:"",
    },
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
    setup(props, context) {
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
        const view = shallowRef()
        const handleReady = (payload:any) => {
          view.value = payload.view
        }

        const getSelection = () => {
          const state = view.value.state
          const ranges = state.selection.ranges
          const startOffset = ranges.reduce((r:any, range:any) => r + range.to - range.from, 0)
          const inverse = ranges[0].anchor > ranges[0].head
          let start = 0
          let end = 0
          if(inverse){
            start = ranges[0].anchor - startOffset
            end = ranges[0].anchor
          }else{
            start = ranges[0].anchor
            end = ranges[0].anchor + startOffset
          }
          const total = state.doc.length
          return {
            name: 'aditorCode',
            vid: props.aNode.virtualId,
            single: start === end,
            start,
            end,
            total
          }
        }

        const getSelectionText = ()=>{
          const state = view.value.state
          const ranges = state.selection.ranges
          const selected_end = ranges.reduce((r:any, range:any) => r + range.to - range.from, 0)
          const cursor = ranges[0].anchor
          const length = state.doc.length
          const lines = state.doc.lines
          const forwardText = "```"+language.value+"\n"+state.doc.sliceString(0, cursor)
          const selectedText = state.doc.sliceString(cursor, cursor + selected_end)
          const backwardText = state.doc.sliceString(cursor + selected_end, length)+"\n```"
          return {forwardText, selectedText, backwardText}
        }

        const replaceMsg = (item:any, selection: any)=>{
            const replaceContent = item?.content || ''
            const start = selection?.extend?.start
            const end = selection?.extend?.end
            const newCode = code.value.slice(0, start) + replaceContent + code.value.slice(end)
            dispatchUpdateData(props.docView, props.aNode.start, Object.assign(props.aNode.data, {code: newCode}) )
            
        }

        const appendMsg = (item:any, selection: any)=>{
            const msg = item?.content || ''
            const start = selection?.extend?.start
            const newCode = code.value.slice(0, start) + msg + code.value.slice(start)
            dispatchUpdateData(props.docView, props.aNode.start, Object.assign(props.aNode.data, {code: newCode}) )
        }


        context.expose({ getSelection, getSelectionText, replaceMsg, appendMsg})

        onMounted(() => {
          props.docView.setVueComponent(props.aNode.virtualId, getCurrentInstance())
        })

        onUnmounted(() => {
          props.docView.deleteVueComponent(props.aNode.virtualId)
        })


        return {
          editor,
          code,
          extensions,
          handleReady,

        }
    },
    config
})

</script>

<style scoped>
</style>