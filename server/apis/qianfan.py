import requests
import json
from server.globalObject import global_obj


def qianfan_chat(_prompt, history=[], system="", API_KEY = None, SECRET_KEY = None):
    if not API_KEY:
        API_KEY = global_obj.config.get("QianFan API Key")
    if not SECRET_KEY:
        SECRET_KEY = global_obj.config.get("QianFan Secret Key")
        
    response_flag = True
    msg = ""
    response_list = []
    prompt = history
    prompt.append({
        "role": "user",
        "content": _prompt
    })
  
    # 判断整体是否是奇数，如果不是，则弹出第一个
    if len(prompt) % 2 == 0:
        prompt.pop(0)

    # Qianfan 3.5 api必须是奇数，且奇数位必须是user, 偶数位必须是assistant，所以进行强制校验和转换
    for i in range(len(prompt)):
        if i % 2 == 0:
            prompt[i]["role"] = "user"
        else:
            prompt[i]["role"] = "assistant"

    try:
        url = "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/ernie-3.5-8k-0205?access_token=" + get_access_token(API_KEY, SECRET_KEY)
        
        payload = json.dumps({
            "messages": prompt,
            "temperature": 0.8,
            "top_p": 0.8,
            "penalty_score": 1,
            "disable_search": False,
            "enable_citation": False,
            "response_format": "text"
        })
        headers = {
            'Content-Type': 'application/json'
        }
        
        response = requests.request("POST", url, headers=headers, data=payload)
        result = json.loads(response.text)
        response_list.append({
            "type": "text",
            "name": "QianFan",
            "role": "assistant",
            "data": [{
                "type": "text",
                "text": result.get("result")
            }]
        })
    except Exception as e:
        response_flag = False
        msg = "QianFan API error:"+str(e)

    return response_flag, msg, response_list
    

def get_access_token(API_KEY, SECRET_KEY):
    """
    使用 AK，SK 生成鉴权签名（Access Token）
    :return: access_token，或是None(如果错误)
    """

    url = "https://aip.baidubce.com/oauth/2.0/token"
    params = {"grant_type": "client_credentials", "client_id": API_KEY, "client_secret": SECRET_KEY}
    return str(requests.post(url, params=params).json().get("access_token"))
