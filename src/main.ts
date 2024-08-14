import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import './mockjs'
import './polyfill'

import { registerComponent, ANodeType } from 'vue-aditor'
import 'vue-aditor/dist/style.css'
import AditorCanvas from './components/aditor_extensions/aditorCanvas.vue'
import AditorAudio from './components/aditor_extensions/aditorAudio.vue'
import AditorTitleParagraph from './components/aditor_extensions/aditorTitleParagraph.vue'
import AditorConfig from './components/aditor_extensions/aditorConfig.vue'
import AditorAIChat from './components/aditor_extensions/aditorAIChat.vue'
import AditorPDF from './components/aditor_extensions/aditorPDF.vue'
import AditorCode from './components/aditor_extensions/aditorCode.vue'
import aditorQuote from './components/aditor_extensions/aditorQuote.vue'
import aditorMindMap from './components/aditor_extensions/aditorMindMap.vue'
import configState from './config.ts'


registerComponent(AditorTitleParagraph.name, ANodeType.Child, AditorTitleParagraph)
registerComponent(aditorQuote.name, ANodeType.Child, aditorQuote)
registerComponent(AditorCanvas.name, ANodeType.Leaf, AditorCanvas)
registerComponent(AditorAudio.name, ANodeType.Leaf, AditorAudio)
registerComponent(AditorConfig.name, ANodeType.Leaf, AditorConfig)
registerComponent(AditorAIChat.name, ANodeType.Leaf, AditorAIChat)
registerComponent(AditorPDF.name, ANodeType.Leaf, AditorPDF)
registerComponent(AditorCode.name, ANodeType.Leaf, AditorCode)
registerComponent(aditorMindMap.name, ANodeType.Leaf, aditorMindMap)


createApp(App).mount('#app')
