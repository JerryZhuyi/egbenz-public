# markdown语法正则合集
import re,os
import base64
import requests
import argparse

regs = [
    {'name': 'title', 'reg': r'^#{1,6} .*'}
    , {'name': 'bold', 'reg': r'\*\*.*\*\*'}
    , {'name': 'italic', 'reg': r'\*.*\*'}
    , {'name': 'link', 'reg': r'\[.*?\]\(.*?\)'}
    , {'name': 'image', 'reg': r'!\[.*?\]\(.*?\)'}
    # code匹配所有字符，包括换行符
    , {'name': 'code', 'reg': r'```[\s\S]*?```'}
    , {'name': 'list', 'reg': r'^\d\..*'}
    , {'name': 'table', 'reg': r'\|.*\|'}
    , {'name': 'hr', 'reg': r'---'}
    , {'name': 'br', 'reg': r'\n'}
    , {'name': 'formula', 'reg': r'\$\$.*\$\$'}
    , {'name': 'inline_formula', 'reg': r'\$.*?\$'}
    # 引用节点
    , {'name': 'quote', 'reg': r'^>.*'}
]
# 匹配中文本时的转义字符
trans_dict = {"\\<": "<", "\\>": ">", "\\(": "(", "\\)": ")"}

class Token:
    def __init__(self, type_, value):
        self.type = type_
        self.value = value

    def __str__(self):
        return f'{self.type}: {self.value}'

class Tokenizer:
    def __init__(self, input_):
        self.input = input_

    def tokenize(self):
        tokens = []
        i = 0
        text_cache = ""
        while i < len(self.input):
            # 遍历正则表达式
            for reg in regs:
                # 匹配
                # 如果正则匹配是'^'开头，则判断text_cache是否为空，不为空则默认失败，不判断
                if reg['reg'].startswith('^') and text_cache != "":
                    continue

                match = re.match(reg['reg'], self.input[i:])
                if match:
                    # 如果文本缓存不为空，则添加到tokens中
                    if text_cache:
                        tokens.append(Token('text', text_cache))
                        text_cache = ""
                    # 添加token
                    tokens.append(Token(reg['name'], match.group()))
                    # 更新i
                    i += len(match.group())
                    break

            # 如果全都没匹配上，则缓存在文本区，并+1
            if not match:
                if i < len(self.input):
                    text_cache += self.input[i]
                i += 1
                
            
                
        return tokens

class Parser:
    def __init__(self, tokens, base_path="/", intercept_path="static"):
        self.tokens = tokens
        self.base_path = base_path
        self.intercept_path = intercept_path

    # 实现token到aditor的转换
    def parse(self):
        aditorNodes = []
        last_node = None
        for token in self.tokens:
            if token.type == 'text':
                node = self._create_text(token.value)
                if last_node is not None and last_node.get("name") in ["aditorParagraph", "aditorQuote", "aditorTitleParagraph"]:
                    last_node["children"].append(node)
                else:
                    paragraphNode = self._create_paragraph()
                    paragraphNode["children"].append(node)
                    aditorNodes.append(paragraphNode)
                    last_node = paragraphNode
            elif token.type == 'title':
                # 去掉开头所有的#和空格
                text = token.value.lstrip('#').lstrip()
                level = token.value.count('#')
                node = self._create_title(text, level)
                aditorNodes.append(node)
                last_node = node
            elif token.type == 'bold':
                node = self._create_text(token.value.lstrip('**').rstrip('**'), {'font-weight': 'bold'})
                if last_node is not None and last_node.get("name") == "aditorParagraph":
                    last_node["children"].append(node)
                else:
                    paragraphNode = self._create_paragraph()
                    paragraphNode["children"].append(node)
                    aditorNodes.append(paragraphNode)
                    last_node = paragraphNode
            elif token.type == 'italic':
                node = self._create_text(token.value.lstrip('*').rstrip('*'), {'font-style': 'italic'})
                if last_node is not None and last_node.get("name") == "aditorParagraph":
                    last_node["children"].append(node)
                else:
                    paragraphNode = self._create_paragraph()
                    paragraphNode["children"].append(node)
                    aditorNodes.append(paragraphNode)
                    last_node = paragraphNode
            elif token.type == 'link':
                node = self._create_link(token.value.split(']')[0].lstrip('['), token.value.split('](')[1].rstrip(')'))
                if last_node is not None and last_node.get("name") == "aditorParagraph":
                    last_node["children"].append(node)
                else:
                    paragraphNode = self._create_paragraph()
                    paragraphNode["children"].append(node)
                    aditorNodes.append(paragraphNode)
                    last_node = paragraphNode
            elif token.type == 'image':
                node = self._create_image(src2path(token.value.split('](')[1].rstrip(')'), self.base_path, self.intercept_path))
                paragraphNode = self._create_paragraph()
                paragraphNode["children"].append(node)
                aditorNodes.append(paragraphNode)
                last_node = node # 这里保存为image节点,这样下一个节点会新起一个段落
            elif token.type == 'code':
                language = token.value.split('\n')[0].lstrip('```')
                code = '\n'.join(token.value.split('\n')[1:-1])
                node = self._create_code(code, language)
                paragraphNode = self._create_paragraph()
                paragraphNode["children"].append(node)
                aditorNodes.append(paragraphNode)
                last_node = node
            # 暂时没有list节点，用文本节点输出
            elif token.type == 'list':
                node = self._create_text(token.value)
                paragraphNode = self._create_paragraph()
                paragraphNode["children"].append(node)
                aditorNodes.append(paragraphNode)
                last_node = node
            # 暂时没有table节点，用文本节点输出
            elif token.type == 'table':
                node = self._create_text(token.value)
                paragraphNode = self._create_paragraph()
                paragraphNode["children"].append(node)
                aditorNodes.append(paragraphNode)
                last_node = node
            # 把last_node置为None，这样下一个节点会新起一个段落
            elif token.type == 'hr':
                last_node = None
            elif token.type == 'br':
                last_node = None
            elif token.type == 'formula':
                node = self._create_formula(token.value.lstrip('$$').rstrip('$$'), True)
                paragraphNode = self._create_paragraph()
                paragraphNode["children"].append(node)
                aditorNodes.append(paragraphNode)
                last_node = node
            elif token.type == 'inline_formula':
                node = self._create_formula(token.value.lstrip('$').rstrip('$'))
                if last_node is not None and last_node.get("name") == "aditorParagraph":
                    last_node["children"].append(node)
                else:
                    paragraphNode = self._create_paragraph()
                    paragraphNode["children"].append(node)
                    aditorNodes.append(paragraphNode)
                    last_node = paragraphNode
            
            elif token.type == 'quote':
                node = self._create_text(token.value.lstrip('>'))
                quoteNode = self._create_quote()
                quoteNode["children"].append(node)
                aditorNodes.append(quoteNode)
                last_node = quoteNode
        
        return aditorNodes

    def _create_paragraph(self):
        return {
            "name": "aditorParagraph",
            "type": "child",
            "style": {},
            "data": {
            },
            "text": "",
            "children": []
        }
    
    def _create_title(self, text, level):
        return {
            "name": "aditorTitleParagraph",
            "type": "child",
            "style": {},
            "data": {
                "level": level,
            },
            "children": [{
                "name": "aditorText",
                "type": "leaf",
                "style": {},
                "data": {
                },
                "text": text,
            }]
        }
    
    def _create_text(self, text, style={}):
        replace_text = text 
        for original, new in trans_dict.items():
            replace_text = replace_text.replace(original, new)
        return {
            "name": "aditorText",
            "type": "leaf",
            "style": style,
            "data": {
            },
            "text": replace_text,
        }
    
    def _create_link(self, text, link):
        return {
            "name": "aditorLink",
            "type": "leaf",
            "style": {},
            "data": {
                "href": link
            },
            "text": text,
        }

    def _create_image(self, src):
        return {
            "name": "aditorImage",
            "type": "leaf",
            "style": {},
            "data": {
                "src": src
            },
            "text": "",
        }
    
    def _create_formula(self, formula, displayMode=False):
        return {
            "name": "aditorKatex",
            "type": "leaf",
            "style": {},
            "data": {
                "katex": formula,
                "displayMode": displayMode
            },
        }
    
    def _create_code(self, code, language="python"):
        return {
            "name": "aditorCode",
            "type": "leaf",
            "style": {},
            "data": {
                "code": code,
                "language": language
            },
        }
    
    def _create_quote(self):
        return {
            "name": "aditorQuote",
            "type": "child",
            "style": {},
            "data": {
            },
            "children": []
        }

def markdown_to_html(markdown_text, base_path="/", intercept_path="static", aditorVersion="0.0.15", egbenzVersion="0.0.7"):
    tokenizer = Tokenizer(markdown_text)
    tokens = tokenizer.tokenize()
    parser = Parser(tokens, base_path, intercept_path)
    nodes = parser.parse()

    aditor = {
        "name": "aditor",
        "type": "child",
        "style": {},
        "data": {
            "version": aditorVersion,
            "egbenzVersion": egbenzVersion
        },
        "children": nodes
    }

    return aditor

def local_markdown_to_html(file_path, base_path="/", intercept_path="static", aditorVersion="0.0.15", egbenzVersion="0.0.7"):
    save_path = file_path.replace('.md', '.ai')
    with open(file_path, 'r', encoding='utf-8') as f:
        markdown_text = f.read()
    
    file_aditor = markdown_to_html(markdown_text, base_path, intercept_path, aditorVersion, egbenzVersion)
    import json
    with open(save_path, 'w', encoding='utf-8') as f:
        json.dump(file_aditor, f, ensure_ascii=False, indent=4)

    return file_aditor


def src2path(src, base_path="/", intercept_path="static"):
    # 如果src是本地路径,不是http开头,直接返回
    if not src.startswith("http"):
        try:
            # 读取远程请求的图片，转成base64编码
            # 获取图片的响应
            response = requests.get(src)
            # 将响应的内容转换为base64编码
            img_base64 = base64.b64encode(response.content)
            # 返回base64编码的字符串
            return img_base64.decode()
        except:
            return src
    else:
        # 从第一个intercept_path开始阶段，分成两部分(不包括intercept_path)
        index = src.find(intercept_path) + len(intercept_path)
        append_path = src[index:]
        # 拆分为数组，重新使用python的sys.path的join方法,避免了windows和linux的路径分隔符问题
        prepend_path = base_path.split("/")
        append_path = append_path.split("/")
        
        # 读取本地图片。转成base64编码
        file_path = os.path.join(*prepend_path, *append_path)
        # 判断文件是否存在
        if not os.path.exists(file_path):
            return src
        # 判断文件类型，用于base64编码前缀
        prefix = "data:image"
        if file_path.endswith(".png"):
            prefix += "/png"
        elif file_path.endswith(".jpg") or file_path.endswith(".jpeg"):
            prefix += "/jpeg"
        elif file_path.endswith(".gif"):
            prefix += "/gif"
        elif file_path.endswith(".bmp"):
            prefix += "/bmp"
        else:
            return src
        prefix += ";base64,"
        try:
            with open(file_path, 'rb') as f:
                data = f.read()
                data_base64 = base64.b64encode(data).decode()
            return prefix + data_base64
        except:
            return src

    

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('-path', '--file_path', help='The path of the markdown file')
    args = parser.parse_args()
    file_path = args.file_path

    aditor = local_markdown_to_html(file_path, 'E:\egbenz', 'static')

#     markdown = """
# # 环境准备
# requirements.txt的内容
# ```
# --find-links https://download.pytorch.org/whl/torch_stable.html

# pandas==1.3.5
# torch==1.11.0+cu113
# torchdata==0.3.0
# torchtext==0.12
# spacy==3.2
# altair==4.1
# jupytext==1.13
# flake8
# black
# GPUtil
# wandb
# ```

# """
#     tokenizer = Tokenizer(markdown)
#     tokens = tokenizer.tokenize()

#     # 遍历并打印tokens
#     for token in tokens:
#         print(token)