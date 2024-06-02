import axios from 'axios';

export const API_URLS = {
    api_files:{
        url:"/api/files",
        method:"post",
    },
    api_aditor_file:{
        url:"/api/file",
        method:"post"
    },
    api_new_folder:{
        url:"/api/new_folder",
        method:"post"
    },
    api_new_file:{
        url:"/api/new_ai_file",
        method:"post"
    },
    api_update_file:{
        url:"/api/update_file",
        method:"post"
    },
    api_refresh:{
        url:"/api/refresh",
        method:"post"
    },
    api_delete_path:{
        url:"/api/delete_path",
        method:"post"
    },
    api_rename_path:{
        url:"/api/rename_path",
        method:"post"
    },

    api_chatgpt:{
        url:"/api/chatgpt",
        method:"post",
        timeout: 60000
    },

    api_config:{
        url:"/api/config",
        method:"post"
    },
    
    api_set_config:{
        url:"/api/set_config",
        method:"post"
    },

    api_draw_process:{
        url:"/api/sdapi/v1/progress",
        method: "post"
    },

    api_ai_draw:{
        url:"/api/sdapi/v1/magic_draw",
        method: "post",
        // ai请求最多等待30分钟
        timeout: 1800000
    },

    api_ai_txt2img:{
        url:"/api/sdapi/v1/magic_txt2img",
        method: "post",
        // ai请求最多等待30分钟
        timeout: 1800000
    },

    api_ai_voice:{
        url:"/api/vits/text2voice",
        method: "post",
        // ai请求最多等待10分钟
        timeout: 600000
    },

    api_pdf2html:{
        url:"/api/pdf2html",
        method: "post",
        // ai请求最多等待1分钟
        timeout: 60000
    },

    // sd状态轮询
    api_sd_progess:{
        url:"/api/sdapi/v1/progress",
        method: "get"
    },

    // 中断sd2请求
    api_sd2_interrupt:{
        url:"/api/sdapi/v1/interrupt",
        method: "post"
    },

    //百度千帆
    api_qianfan_chat:{
        url:"/api/qianfan/chat",
        method:"post",
        timeout: 60000
    }
    
}


const commonRequestProcess = (api: {url: string, method: string, timeout?: number}, params:any) => {
    const isProduction = process.env.NODE_ENV === 'production';
    // 正式环境去掉前缀'/api'
    const url = isProduction && api.url.startsWith('/api') ? api.url.slice(4):api.url;
    const instance = axios.create({
        timeout: api.timeout? api.timeout: 10000,
    });

    return api.method == "get" ? instance({url, method: api.method, params}):instance({url, method: api.method, data: params})
}

export const request = {
    getFiles: (params?: {})=>commonRequestProcess(API_URLS.api_files, params)
    , getAditorFile: (params?: {})=>commonRequestProcess(API_URLS.api_aditor_file, params)
    , newFolder: (params?: {})=>commonRequestProcess(API_URLS.api_new_folder, params)
    , newFile: (params?: {})=> commonRequestProcess(API_URLS.api_new_file, params)
    , updateFile: (params?: {})=> commonRequestProcess(API_URLS.api_update_file, params)
    , refresh: (params?: {})=> commonRequestProcess(API_URLS.api_refresh, params)
    , deletePath: (params?: {})=> commonRequestProcess(API_URLS.api_delete_path, params)
    , renamePath: (params?: {})=> commonRequestProcess(API_URLS.api_rename_path, params)

    , chatgpt: (params?: {})=> commonRequestProcess(API_URLS.api_chatgpt, params)

    , getConfig: (params?: {})=> commonRequestProcess(API_URLS.api_config, params)
    , setConfig: (params?: {})=> commonRequestProcess(API_URLS.api_set_config, params)

    , drawProcess: (params?: {})=> commonRequestProcess(API_URLS.api_draw_process, params)
    , aiDraw: (params?: {})=> commonRequestProcess(API_URLS.api_ai_draw, params)
    , aiTxt2Img: (params?: {})=> commonRequestProcess(API_URLS.api_ai_txt2img, params)
    , sdProgress: (params?: {})=> commonRequestProcess(API_URLS.api_sd_progess, params)
    , sd2Interrupt: (params?: {})=> commonRequestProcess(API_URLS.api_sd2_interrupt, params)

    , aiVoice: (params?: {})=> commonRequestProcess(API_URLS.api_ai_voice, params)

    , pdf2html: (params?: {})=> commonRequestProcess(API_URLS.api_pdf2html, params)
    , qianfanChat: (params?: {})=> commonRequestProcess(API_URLS.api_qianfan_chat, params)
}
