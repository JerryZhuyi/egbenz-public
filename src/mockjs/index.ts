import Mock from 'mockjs';
import { API_URLS } from '../api';

function importMock() {
    if (import.meta.env.ENV == "production") {
        return
    }
    Mock.mock(RegExp(API_URLS.api_files.url + ".*"), API_URLS.api_files.method, (options:any)=>{
        // GET方法获取参数：把url?后面的参数转成键值对
        // const url = options.url
        // const params = url.split('?')[1].split('&').reduce((pre:any, cur:any) => {
        //     const [key, value] = cur.split('=')
        //     // 由于是url链接里面的字符，对于中文需要做一次转码
        //     pre[key] = decodeURIComponent(value)
        //     return pre
        // }, {})

        const params = JSON.parse(options.body)
        const name = params?.path?.split('/').pop()
        if(params?.path === '所有笔记'){
            return {
                status: true,
                msg: 'success',
                name: name,
                path: params?.path,
                files: [
                    { name: '其他', type: 'folder'},
                    { name: 'Test.ai', type: 'file'},
                    { name: 'Test2.ai', type: 'file'},
                ]
            }
        }else if(params?.path === '所有笔记/其他'){
            return {
                status: true,
                msg: 'success',
                name: name,
                path: params?.path,
                files: [
                    { name: 'Test.ai', type: 'file'},
                ]
            }
        }else{
            return {
                status: true,
                msg: 'success',
                name: name,
                path: params?.path,
                files: []
            }
        }
        
    });

    Mock.mock(RegExp(API_URLS.api_aditor_file.url + ".*"), API_URLS.api_aditor_file.method, {
        status: 200,
        msg: 'success',
        // 正常doc
        doc: {
            "name": "aditor",
            "type": "child",
            "style": {},
            "data": {
                "version": "0.0.1",
            },
            children: [
                {
                    "name": "aditorParagraph",
                    "type": "child",
                    "style": {},
                    "data": {
                    },
                    "children": [{
                        "name": "aditorText",
                        "type": "leaf",
                        "style": {"font-weight": "bold"},
                        "data": {
                        },
                        "text": "hello world",
                        "children": []
                    },{
                        "name": "aditorLink",
                        "type": "leaf",
                        "style": {},
                        "data": {
                            "href": "https://localhost:8081/",
                        },
                        "text": "hello world",
                        "children": []
                    }]
                },{
                    "name": "aditorParagraph",
                    "type": "child",
                    "style": {},
                    "data": {
                    },
                    "children": [{
                        "name": "aditorCode",
                        "type": "leaf",
                        "style": {},
                        "data": {
                            "code": "console.log('Hello World')",
                            "language": "javascript"
                        },
                    }]
                },{
                    "name": "aditorQuote",
                    "type": "child",
                    "style": {},
                    "data": {
                    },
                    "children": [{
                        "name": "aditorText",
                        "type": "leaf",
                        "style": {},
                        "data": {
                        },
                        "text": "hello world",
                        "children": []
                    }]
                }
            ]
        }
        // PDF doc
        // doc: {
        //     "name": "aditor",
        //     "type": "child",
        //     "style": {},
        //     "data": {
        //         "version": "0.0.1",
        //     },
        //     children: [
        //         {
        //             "name": "aditorParagraph",
        //             "type": "child",
        //             "style": {},
        //             "data": {
        //             },
        //             "children": [{
        //                 "name": "aditorText",
        //                 "type": "leaf",
        //                 "style": {"font-weight": "bold"},
        //                 "data": {
        //                 },
        //                 "text": "hello world",
        //                 "children": []
        //             }]
        //         },
        //         {
        //             "name": "aditorParagraph",
        //             "type": "child",
        //             "style": {},
        //             "data": {
        //             },
        //             "children": [{
        //                 "name": "aditorPDF",
        //                 "type": "leaf",
        //                 "style": {},
        //                 "data": {
        //                     "name": "Diffusion.pdf"
        //                 },
        //                 "text": "",
        //                 "children": []
        //             }]
        //         }
        //     ]
        // }
        // 画布doc
        // doc:{
        //     "name": "aditor",
        //     "type": "child",
        //     "style": {},
        //     "data": {
        //         "version": "0.0.1",
        //     },
        //     "children": [
        //         {
        //             "name": "aditorParagraph",
        //             "type": "child",
        //             "style": {},
        //             "data": {
                        
        //             },
        //             "children": [{
        //                 "name": "aditorText",
        //                 "type": "leaf",
        //                 "style": {},
        //                 "data": {
        //                 },
        //                 "text": "hello world",
        //                 "children": []
        //             }]
        //         }, {
        //             "name": "aditorParagraph",
        //             "type": "child",
        //             "style": {},
        //             "data": {
                        
        //             },
        //             "children": [{
        //                 "name": "aditorCanvas",
        //                 "type": "leaf",
        //                 "style": {},
        //                 "data": {
        //                 },
        //                 "text": "",
        //                 "children": []
        //             }]
        //         }, {
        //             "name": "aditorParagraph",
        //             "type": "child",
        //             "style": {},
        //             "data": {
                        
        //             },
        //             "children": [{
        //                 "name": "aditorAIChat",
        //                 "type": "leaf",
        //                 "style": {},
        //                 "data": {
        //                     "msgs":[{
        //                         "type": "text",
        //                         "name": "gpt3.5",
        //                         "role": "user",
        //                         "data": [{
        //                             "type": "text",
        //                             "text": "hello"
        //                         }]
        //                     }, {
        //                         "type": "text",
        //                         "name": "gpt3.5",
        //                         "role": "assistant",
        //                         "data": [{
        //                             "type": "text",
        //                             "text": "world"
        //                         }]
        //                     }, {
        //                         "type": "text",
        //                         "name": "sd",
        //                         "role": "user",
        //                         "data": [{
        //                             "type": "text",
        //                             "text": "帮我画一幅话，参数如下"
        //                         }]
        //                     }, {
        //                         "type": "image",
        //                         "name": "sd",
        //                         "role": "assistant",
        //                         "data": [{
        //                             "type": "image",
        //                             "src": "./images/test.png",
        //                             "params": "正向提示词:123"
        //                         }, {
        //                             "type": "image",
        //                             "src": "./images/test.png",
        //                             "params": "正向提示词:123"
        //                         }, {
        //                             "type": "image",
        //                             "src": "./images/test.png",
        //                             "params": "正向提示词:123"
        //                         }, {
        //                             "type": "image",
        //                             "src": "./images/test.png",
        //                             "params": "正向提示词:123"
        //                         }, {
        //                             "type": "image",
        //                             "src": "./images/test.png",
        //                             "params": "正向提示词:123"
        //                         }, {
        //                             "type": "image",
        //                             "src": "./images/test.png",
        //                             "params": "正向提示词:123"
        //                         }, {
        //                             "type": "image",
        //                             "src": "./images/test.png",
        //                             "params": "正向提示词:123"
        //                         }, {
        //                             "type": "image",
        //                             "src": "./images/test.png",
        //                             "params": "正向提示词:123"
        //                         }, {
        //                             "type": "image",
        //                             "src": "./images/test.png",
        //                             "params": "正向提示词:123"
        //                         }]
        //                     }]
        //                 },
        //                 "text": "",
        //                 "children": []
        //             }]
        //         }
        //     ]
        // }

        //配置页面Doc
        // doc: {
        //     "name": "aditor",
        //     "type": "child",
        //     "style": {},
        //     "data": {
        //         "version": "0.0.1",
        //     },
        //     "children": [
        //         {
        //             "name": "aditorParagraph",
        //             "type": "child",
        //             "style": {},
        //             "data": {
        //             },
        //             "children": [{
        //                 "name": "aditorConfig",
        //                 "type": "leaf",
        //                 "style": {},
        //                 "data": {
        //                     "config_id": 1,
        //                     "config_name": "gpt_proxy",
        //                     "config_value": ""
        //                 },
        //                 "children": []
        //             }]
        //         }
        //         , {
        //             "name": "aditorParagraph",
        //             "type": "child",
        //             "style": {},
        //             "data": {
                        
        //             },
        //             "children": [{
        //                 "name": "aditorConfig",
        //                 "type": "leaf",
        //                 "style": {},
        //                 "data": {
        //                     "config_id": 2,
        //                     "config_name": "gpt_key",
        //                     "config_value": ""
        //                 },
        //                 "children": []
        //             }]
        //         }, {
        //             "name": "aditorParagraph",
        //             "type": "child",
        //             "style": {},
        //             "data": {
                        
        //             },
        //             "children": [{
        //                 "name": "aditorCanvas",
        //                 "type": "leaf",
        //                 "style": {},
        //                 "data": {
        //                     "canvas":{},
        //                     "state":{}
        //                 },
        //                 "children": []
        //             }]
        //         }
        //     ]
        // }
    });

    Mock.mock(RegExp(API_URLS.api_ai_draw.url + ".*"), API_URLS.api_new_folder.method, {
        status: true,
        msg: 'success',
        images: [{
            images:["/images/test.png"],
            type: "link",
        }]
    });

    Mock.mock(RegExp(API_URLS.api_draw_process.url + ".*"), API_URLS.api_new_folder.method, {
        status: true,
        msg: 'success',
        progress: 1,
    });

    Mock.mock(RegExp(API_URLS.api_config.url + ".*"), API_URLS.api_new_folder.method, {
        status: true,
        msg: 'success',
        contents:{}
    });

}

// importMock()