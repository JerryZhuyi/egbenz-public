<template>
    <div class="pdf-card" contenteditable="false" aditor-ignore-event>
        <div class="pdf-card-top">
            <div class="pdf-icon">
                <el-icon :size="40" class="el-icon--right">
                    <PDFIcon />
                </el-icon>
            </div>
            <div class="pdf-info">
                <div class="pdf-name">{{ aNode.data.name }}</div>
                <div class="pdf-size">{{ formatSize(aNode.data.size) }}</div>
            </div>
            <div class="buttons">
                <button @click="openPDF">新窗口打开</button>
                <button @click="pdf2AditorNode(true)">转文本</button>
                <el-popover :visible="showButtons" placement="bottom" :width="190" >
                    <div class="get-by-pages">
                        <input v-model="pageStart" /><div>到</div><input v-model="pageEnd" /><div>页</div>
                        <button @click="showButtons = false; pdf2AditorNode(false)">确定</button>
                    </div>
                    <div class="get-page-cancel">
                        <button @click="showButtons = false">取消</button>
                    </div>
                    <template #reference>
                        <button @click="showButtons = !showButtons">分页转</button>
                    </template>
                </el-popover>
            </div>
        </div>
        
    </div>
</template>

<script lang="ts">
import { defineComponent, PropType, ref, onMounted, onUnmounted, getCurrentInstance} from 'vue'
import { AditorDocView, ANodeType, ExportNodeConfig, AditorNode, createAditorNode, ViewEventEnum } from 'vue-aditor'
import {
    DocumentPdf32Filled as PDFIcon,

} from '@vicons/fluent'
import { request } from '../../api/index.ts';

const config: ExportNodeConfig = {
    secondaryType: ANodeType.BlockLeaf,
    dataKeyName: 'href',
    validStyleList: [
    ],
}

export default defineComponent({
    name: 'aditorPDF',
    components: {
        PDFIcon,
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
        const showButtons = ref(false)
        const pageStart = ref(1)
        const pageEnd = ref(1)

        const base64ToBlob = (base64Data: string) => {
            const base64WithoutPrefix = base64Data.split(',')[1];

            const byteCharacters = atob(base64WithoutPrefix);
            const byteArrays = [];

            for (let offset = 0; offset < byteCharacters.length; offset += 512) {
                const slice = byteCharacters.slice(offset, offset + 512);

                const byteNumbers = new Array(slice.length);
                for (let i = 0; i < slice.length; i++) {
                    byteNumbers[i] = slice.charCodeAt(i);
                }

                const byteArray = new Uint8Array(byteNumbers);
                byteArrays.push(byteArray);
            }

            const blob = new Blob(byteArrays, { type: 'application/pdf' });
            return blob;
        }

        const openPDF = () => {
            const pdfData = props.aNode.data.href;
            const blob = base64ToBlob(pdfData);
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        }

        const validatePage = (page: number) => {
            // 转成数字
            page = parseInt(page.toString());
            // 如果不是数字，或者是负数，返回1
            if (isNaN(page)) {
                return 0;
            }
            if (page < 1) {
                return 0;
            }
            return page-1;
        }

        const pdf2AditorNode = (is_all:boolean=false) => {
            const page_start = validatePage(pageStart.value)
            const page_end = validatePage(pageEnd.value)

            request.pdf2html({ href: props.aNode.data.href, is_all, page_start, page_end}).then((res) => {
                if (res.status === 200) {
                    const { html } = res.data;
                    // 把html按换行拆成数组
                    const htmlArr = html.split('\n');
                    const paragraphs:AditorNode[] = []
                    // 逐行遍历
                    htmlArr.forEach((line:string, _index:number) => {
                        // 过滤空行
                        if(line.trim() === ''){
                            return
                        }
                        // 创建一个文本节点
                        const textNode = createAditorNode("aditorText", {}, {}, line)
                        // 将文本节点插入到当前节点的子节点中
                        const paragraphNode = createAditorNode("aditorParagraph", {}, {})
                        paragraphNode.children.push(textNode)
                        paragraphs.push(paragraphNode)
                    });
                    // 添加一行多少页系统输出标记
                    const sysOutput = ">>> PDF转换完成(" + (is_all ? "全部" : "第"+page_start+"到"+page_end) + "页) <<<"
                    const sysOutputNode = createAditorNode("aditorText", {'font-weight': 'bold', 'background-color':'#67c23a'}, {}, sysOutput)
                    const sysOutputParagraph = createAditorNode("aditorParagraph", {'text-align':'center'}, {})
                    sysOutputParagraph.children.push(sysOutputNode)
                    paragraphs.push(sysOutputParagraph)
                    // 开头在添加一个开始标记
                    const startOutput = ">>> PDF转换开始(" + (is_all ? "全部" : "第"+page_start+"到"+page_end) + "页) <<<"
                    const startOutputNode = createAditorNode("aditorText", {'font-weight': 'bold', 'background-color':'#67c23a'}, {}, startOutput)
                    const startOutputParagraph = createAditorNode("aditorParagraph", {'text-align':'center'}, {})
                    startOutputParagraph.children.push(startOutputNode)
                    paragraphs.unshift(startOutputParagraph)
                    

                    const startIndex = props.docView.docState.findNodeRootIndexByPos(props.aNode.start)
                    const endNode = props.docView.docState.root.children[startIndex-1].dfsDeepestRightEndNode()
                    const vsels = []
                    if(startIndex !== -1){
                        vsels.push({
                            start: endNode.end,
                            end: endNode.end,
                            startOffset: endNode.length(),
                            endOffset: endNode.length()
                        })
                    }else{
                        vsels.push({
                            start: props.docView.docState.root.start,
                            end: props.docView.docState.root.start,
                            startOffset: 0,
                            endOffset: 0
                        })
                    }
                    props.docView.dispatchViewEvent(new Event('keydown'), ViewEventEnum.INSERT_NODES_SELECTIONS, vsels, props.docView.docState, { nodeList: paragraphs });
                }
            }).catch((err) => {
                console.error(err);
            })
        }
        // 将字节大小根据情况转成KB,MB,GB
        const formatSize = (size: number | null | undefined) => {
            if (size === 0) return '0B';
            if (!size) return '无大小信息';

            if (size < 1024) {
                return size + 'B';
            } else if (size < 1024 * 1024) {
                return (size / 1024).toFixed(2) + 'KB';
            } else if (size < 1024 * 1024 * 1024) {
                return (size / 1024 / 1024).toFixed(2) + 'MB';
            } else {
                return (size / 1024 / 1024 / 1024).toFixed(2) + 'GB';
            }
        }

        const getSelection = () => {
          return {
            name: 'aditorPDF',
            vid: props.aNode.virtualId,
            single: true,
            start:0,
            end:0,
            total:0,
            data:{
                selected:false
            }
          }
        }
        const getSelectionText = ()=>{
          return {forwardText:"", selectedText:"", backwardText:""}
        }
        context.expose({ getSelection, getSelectionText})
        onMounted(() => {
            props.docView.setVueComponent(props.aNode.virtualId, getCurrentInstance())
        })

        onUnmounted(() => {
          props.docView.deleteVueComponent(props.aNode.virtualId)
        })

        return {
            showButtons,
            openPDF,
            pdf2AditorNode,
            formatSize,
            pageStart,
            pageEnd
        }
    },
    config
})
</script>
<style scoped>
.pdf-card {
    display: block;
    align-items: center;
    width: 60%;
    height: auto;
    padding: 5px 15px 5px 5px;
    border: 1px solid #ebeef5;
    /* 浅灰色边框 */
    border-radius: 4px;
    /* 圆角 */
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    /* 更淡的阴影效果 */
    transition: box-shadow 0.3s ease, border-color 0.3s ease;
    /* 添加边框颜色的过渡效果 */
    cursor: pointer;
    /* 鼠标移上去显示手型 */
    margin: 10px 0;
    font-size:12px;
}

.pdf-card-top {
    display: flex;
    align-items: center;
}

.pdf-card:hover {
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
    /* 更淡的阴影效果 */
    border-color: #409eff;
    /* 淡蓝色边框 */
}

.pdf-icon img {
    width: 20%;
    height: 90%;
}

.pdf-info {
    flex-grow: 2;
    margin-left: 10px;
}

.pdf-name {
    font-size: 16px;
    line-height: 1.2;
    max-height: 2.4em;
    /* 最大高度，相当于两行 */
    overflow: hidden;
    text-overflow: ellipsis;
    /* 添加省略号 */
    display: -webkit-box;
    /* 使用弹性盒模型 */
    -webkit-line-clamp: 2;
    /* 限制在两行内 */
    -webkit-box-orient: vertical;
    /* 设置为垂直布局 */
    width: 300px;
    /* 宽度 */
}

.pdf-size {
    font-size: 12px;
    color: #888;
}

.buttons {
    transition: all 0.3s ease;
}

.buttons button {
    margin: 0px 5px;
    padding: 5px 10px;
    border: none;
    border-radius: 3px;
    background-color: transparent;
    /* 无背景色 */
    color: #606266;
    /* 深灰色文字 */
    font-size: 12px;
    /* 减小字体 */
    cursor: pointer;
    transition: background-color 0.3s ease;
    /* 添加过渡效果 */
}

.buttons button:hover {
    background-color: #e9ecef;
    /* 淡灰色背景 */
}

.buttons input {
    width: 30px;
    border: 1px solid #dcdfe6;
    border-radius: 2px;
    font-size: 12px;
    color: #606266;
    transition: border-color 0.3s ease;
    height: 14px;
    line-height: 14px;
    margin:0px 5px;
}
.buttons input:focus {
    border-color: #409eff;
}


.get-by-pages{
    display: flex;
    align-items: stretch; /* 使元素在交叉轴上居中 */
    border-radius: 2px;
    padding: 0px;
    height:26px;
    line-height: 26px;
    font-size: 12px;
    justify-content: flex-end;
}
/* 模拟和input一样的边框颜色，不过背景色不同，作为prefix和append */
.get-by-pages div{
    color: #606266;
    padding: 0px 5px;
    margin: 0px;
}
.get-by-pages input{
    width: 30px;
    font-size: 12px;
    line-height: 18px;
    color: #606266;
    transition: border-color 0.3s ease;
    text-align: center;
    outline: none;
    border: 1px solid #dcdfe6;
    border-radius: 3px;
}
.get-by-pages input:focus {
    background-color: #e9ecef;
}

/* 绿色确定按钮 */
.get-by-pages button{
    background-color: #409eff;
    color: #fff;
    font-size: 12px;
    padding:2px 10px;
    /* 减小字体 */
    cursor: pointer;
    transition: background-color 0.3s ease;
    /* 添加过渡效果 */
    line-height: 18px;
    border: none;
    border-radius: 3px;
}
.get-by-pages button:hover {
    background-color: #66b1ff;
}

.get-all{
    margin-top: 5px;
    display: flex;
    align-items: stretch; /* 使元素在交叉轴上居中 */
    border-radius: 2px;
    padding: 0px;
    height:26px;
    line-height: 26px;
    font-size: 12px;
    justify-content: flex-end;
}
.get-all button{
    background-color: #67c23a;
    color: #fff;
    font-size: 12px;
    padding:2px 10px;
    /* 减小字体 */
    cursor: pointer;
    transition: background-color 0.3s ease;
    /* 添加过渡效果 */
    line-height: 18px;
    border: 1px solid #dcdfe6;
    border-radius: 3px;
}
.get-all button:hover {
    background-color: #85ce61;
}

.get-page-cancel{
    margin-top: 5px;
    display: flex;
    align-items: stretch; /* 使元素在交叉轴上居中 */
    border-radius: 2px;
    padding: 0px;
    height:26px;
    line-height: 26px;
    font-size: 12px;
    justify-content: flex-end;
}
/* 灰色取消按钮 */
.get-page-cancel button{
    background-color: transparent;
    color: #606266;
    font-size: 12px;
    padding:2px 10px;
    /* 减小字体 */
    cursor: pointer;
    transition: background-color 0.3s ease;
    /* 添加过渡效果 */
    line-height: 18px;
    border: none;
    border-radius: 3px;
}
.get-page-cancel button:hover {
    background-color: #e9ecef;
}

</style>