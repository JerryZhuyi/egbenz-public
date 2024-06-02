import json
from server.globalObject import global_obj
import traceback
import requests
import httpx
from urllib.parse import urlparse

from pydantic import BaseModel, Field, constr, parse_obj_as
from fastapi import Request, HTTPException
from typing import Dict, Optional, List
from urllib.parse import urlparse
from server.apis.qianfan import qianfan_chat
from server.apis.pdf2html import get_page_text_and_total_pages

class EgbenzRouter:
    def __init__(self, app):
        self.app = app
        self.app.add_api_route("/config", get_config, methods=["POST"], response_model=ConfigResponse)
        self.app.add_api_route("/set_config", set_config, methods=["POST"], response_model=ConfigResponse)
        self.app.add_api_route("/pdf2html", pdf2html, methods=["POST"], response_model=ResponsePDF2HTML)
        self.app.add_api_route("/qianfan/chat", qianfan, methods=["POST"], response_model=ResponseQianfan)


        # 本机转发sd，vits 等路由
        self.app.add_api_route("/sdapi/v1/magic_draw", get_forward, methods=["POST"])
        self.app.add_api_route("/sdapi/v1/magic_txt2img", get_forward, methods=["POST"])
        self.app.add_api_route("/sdapi/v1/magic_img2img", get_forward, methods=["POST"])
        self.app.add_api_route("/sdapi/v1/set_sd_model", get_forward, methods=["POST"])
        self.app.add_api_route("/sdapi/v1/progress", get_forward, methods=["GET"])
        self.app.add_api_route("/sdapi/v1/get_selected_model", get_forward, methods=["GET"])
        self.app.add_api_route("/sdapi/v1/interrupt", get_forward, methods=["POST"])
        self.app.add_api_route("/vits/text2voice", get_forward, methods=["POST"])


class ConfigSetParams(BaseModel):
    key: constr(min_length=1)
    value: constr(min_length=0)

class ConfigResponse(BaseModel):
    status: bool
    message: Optional[str] = Field(default="")
    contents: Optional[Dict] = Field(default={})

def get_config():
    try:
        cfg = global_obj.config.get_all()
        return ConfigResponse(status=True, message="Success", contents=cfg)
    except Exception as e:
        traceback.print_exc()
        return ConfigResponse(status=False, message=str(e), contents={})
    
def set_config(params: ConfigSetParams):
    try:
        global_obj.config.set(params.key, params.value)
        return ConfigResponse(status=True, message="Success", contents=global_obj.config.get_all())
    except Exception as e:
        return ConfigResponse(status=False, message=str(e), contents={})
    
# 转发请求接口, 不限制params类型
async def get_forward(request: Request):
    forward_method = request.method
    
    cfg = global_obj.config.get_all()
    vits_url = cfg.get("VITS URL")
    sd_url = cfg.get("SD URL")
    # 如果是POST请求, 获取请求体
    if forward_method == "POST":
        body = await request.json()
    # 如果是GET请求, 获取请求参数
    else:
        body = dict(request.query_params)
    url = str(request.url)
    path = urlparse(url).path
    # 如果请求地址是/vits/开头的, 转发到VITS接口
    async with httpx.AsyncClient(timeout=1800) as client:
        if path.startswith("/vits/"):
            # 使用request向本机的8082端口转发请求和相关参数
            try:
                if forward_method == "POST":
                    response = await client.post(vits_url + path, json=body)
                else:
                    response = await client.get(vits_url + path, params=body)
                return response.json()
            except httpx.RequestError as e:
                raise HTTPException(status_code=500, detail=str(e))
        elif path.startswith("/sdapi/"):
            try:
                if forward_method == "POST":
                    response = await client.post(sd_url + path, json=body)
                else:
                    response = await client.get(sd_url + path, params=body)
                return response.json()
            except httpx.RequestError as e:
                raise HTTPException(status_code=500, detail=str(e))
        else:
            return {"status": False, "msg": "地址错误"}

# 模型管理
class ParamsPDF2HTML(BaseModel):
    href: str
    is_all: Optional[bool] = Field(default=False)
    page_start: Optional[int] = Field(default=0)
    page_end: Optional[int] = Field(default=-1)

class ResponsePDF2HTML(BaseModel):
    status: bool
    html: str

def pdf2html(params: ParamsPDF2HTML):
    try:
        # html = "功能测试中"
        html = get_page_text_and_total_pages(params.href, params.is_all, params.page_start, params.page_end)
        return ResponsePDF2HTML(status=True, html=html)
    except Exception as e:
        return ResponsePDF2HTML(status=False, html=str(e))

class ParamsQianfan(BaseModel):
    text: str
    history: Optional[List] = Field(default=[])

class ResponseQianfan(BaseModel):
    status: bool
    message: Optional[str] = Field(default="")
    contents: Optional[List] = Field(default=[])

def qianfan(params:ParamsQianfan):
    try:
        r,msg,r_lists = qianfan_chat(params.text, params.history)
        return ResponseQianfan(status=r, message=msg, contents=r_lists)
    
    except Exception as e:
        traceback.print_exc()
        return ResponseQianfan(status=False, message=str(e), contents=[])