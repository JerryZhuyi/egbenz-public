import { ref } from 'vue'
import { request } from './api'
const allConfig = ref([])

request.getConfig().then((res) => {
    if(res.status){
        if(res.data.status){
            allConfig.value = res.data.contents
        }
    }
})

const setConfig = async (key: string, value: string) => {
    // 如果去除首尾空格后key为空或者未定义，则直接返回
    if(key.trim() == "" || key == undefined){
        return
    }
    // 如果value未定义
    if(value == undefined){
        value = ""
    }
    const result = await request.setConfig({key, value}).then((res) => {
        if(res.status){
            if(res.data.status){
                allConfig.value = res.data.contents
            }
        }
        return res

    }).catch((err) => {
        return err
    })
    return result
}

export default {
    allConfig
    , setConfig
}