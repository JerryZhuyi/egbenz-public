import time
import requests

from pydantic import BaseModel, Field
from typing import Dict, List, Optional
import traceback

from server.globalObject import global_obj

# 模型管理
class ParamsChat(BaseModel):
    text: str
    history: Optional[List] = Field(default=[])

class ResponseChat(BaseModel):
    status: bool
    message: Optional[str] = Field(default="")
    contents: Optional[List] = Field(default=[])

def route_chat(params:ParamsChat):
    try:
        r,msg,r_lists = chat(params.text, params.history)
        return ResponseChat(status=r, message=msg, contents=r_lists)
    
    except Exception as e:
        traceback.print_exc()
        return ResponseChat(status=False, message=str(e), contents=[])

def chat(_prompt, history=[], system="",api_key=None, proxy=None, jump_url=None):
    if not api_key:
        api_key = global_obj.config.get("ChatGPT Key")
    if not proxy:
        proxy = global_obj.config.get("GPT Proxy")
    if not jump_url:
        jump_url = global_obj.config.get("JUMP URL")
    
    default_chatgpt_url = "https://api.openai.com/v1/chat/completions"
    msg = ""
    response_text = ""
    response_flag = False
    response_list = []
    max_history = 50
    try:
        prompt = []
        if len(history) > 0:
            i = 0
            filtered_data = []
            for obj in history:
                if i < max_history:
                    filtered_data.append(obj)
                else:
                    break
                i+=1
            prompt += filtered_data

        if len(system) > 0:
            prompt.insert(0, {
                "role": "system",
                "content": system
            })

        prompt.append({
            "role": "user",
            "content": _prompt
        })

        data = {
            "messages": prompt,
            "model":"gpt-3.5-turbo",
            "max_tokens": 1000,
            "temperature": 0.5,
            "top_p": 1,
            "n": 1
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

        proxies = {
            'http': f'http://{proxy}',
            'https': f'http://{proxy}',
        }
        if(not proxy or len(proxy) < 1) and (not jump_url or len(jump_url) < 1):
            response = requests.post(default_chatgpt_url, headers=headers, json=data)
        elif(not proxy or len(proxy) < 1):
            response = requests.post(jump_url, headers=headers, json=data)
        else:
            response = requests.post(proxy, headers=headers, json=data, proxies=proxies)

        response_json = response.json()
        response_text = ""
        response_list = []
        

        try:
            if 'choices' in response_json:
                if len(response_json['choices']) >= 0:
                    response_text = response_json['choices'][0]['message']['content']
                    msg = ""
                    response_flag = True
                else:
                    msg = response_text = "No response from the model"
                    response_flag = True
            elif 'error' in response_json:
                msg = response_text = response_json['error']['message']
                response_flag = True
        except Exception as e:
            msg = response_text = str(e)
            response_flag = False
    except Exception as e:
        msg = response_text = str(e)
        response_flag = False
    
    response_list.append({
        "type": "text",
        "name": data["model"] or "GPT-3.5",
        "role": "assistant",
        "data": [{
            "type": "text",
            "text": response_text
        }]
    })

    return response_flag, msg, response_list



if __name__ == '__main__':
   pass