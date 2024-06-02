<template>
    <div class="aditor-ai-config" contenteditable="false" aditor-ignore-event>
        <div class="config-box">
            <div class="config-title">配置项</div>
            <div class="config-value">
                <el-select v-model="select" @change="handleChange" placeholder="配置项">
                    <el-option v-for="(v, k, i) in configs" :key="k" :label="k" :value="k"></el-option>
                </el-select>
            </div>
        </div>
        <div class="config-box">
            <div class="config-title">值</div>
            <div class="config-value"><el-input v-model="input" style="max-width: 600px" placeholder="请输入配置值"
                    class="input-with-select"></el-input></div>
        </div>
        <div class="config-button-box">
            <el-button @click="handleSave">更新</el-button>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, PropType, ref, onMounted } from 'vue'
import { AditorDocView, ANodeType, ExportNodeConfig, AditorNode, dispatchUpdateData } from 'vue-aditor'
import configState from '../../config.ts'

const config: ExportNodeConfig = {
    secondaryType: ANodeType.BlockLeaf,
    defaultData: {
        'config_key': '工作目录'
    },
    dataKeyName: 'config_key',
    validStyleList: [
    ],
}

export default defineComponent({
    name: 'aditorConfig',
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
        const configs = configState.allConfig
        const input = ref('')
        const select = ref('')
        const handleChange = () => {
            if (select.value in configs.value) {
                input.value = configs.value[select.value as any]
                dispatchUpdateData(props.docView, props.aNode.start, Object.assign({}, props.aNode.data, { config_key: select.value }))
            }
        }
        const handleSave = async () => {
            if (select.value in configs.value) {
                const result = await configState.setConfig(select.value, input.value)
                if(result?.status === 200 && result?.data?.status){
                    ElMessage({
                        showClose: true,
                        duration:0,
                        message: '更新成功',
                        type: 'success',
                    })
                }else{
                    ElMessage({
                        message: '更新失败',
                        type: 'error',
                    })
                }
            }
        }

        onMounted(() => {
            if (props.aNode.data.config_key) {
                select.value = props.aNode.data.config_key
                if (select.value in configs.value) {
                    input.value = configs.value[select.value as any]
                }
            }
        })

        return {
            input,
            select,
            configs,
            handleChange,
            handleSave
        }
    },
    config
})
</script>
<style scoped>
.aditor-ai-config {
    width: 600px;
    border: 1px solid rgb(224, 224, 230);
    box-shadow: var(--e-box-shadow-right);
    padding: 20px;
    /* 添加内边距 */
    border-radius: 4px;
    /* 添加圆角 */
}

.config-box {
    display: flex;
    margin-bottom: 5px;
}

.config-title {
    width: 60px;
    text-align: left;
    padding-right: 10px;
}

.config-value {
    width: 530px;
}

.config-button-box {
    text-align: right;
    margin-top: 10px;
}
</style>