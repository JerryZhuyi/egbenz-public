import os, sys, argparse, stat
import time
import json
from pydantic import BaseModel, Field, constr, parse_obj_as
from typing import Dict, List, Optional
import traceback
from server.globalObject import global_obj
 
# 模型管理
class ParamsPath(BaseModel):
    path: str

class ResponsePath(BaseModel):
    status: bool
    name: Optional[str] = Field(default="")
    path: Optional[str] = Field(default="")
    files: Optional[List] = Field(default=[])
    message: Optional[str] = Field(default="")

class ParamsFile(BaseModel):
    path: str

class ResponseFile(BaseModel):
    status: bool
    type: Optional[str] = Field(default="")
    name: Optional[str] = Field(default="")
    path: Optional[str] = Field(default="")
    update_time: Optional[float] = Field(default=0)
    doc: Optional[Dict] = Field(default={})
    message: Optional[str] = Field(default="")

class ParamsNewFolder(BaseModel):
    path: str
    name: str

class ResponseNewFolder(BaseModel):
    status: bool
    message: Optional[str] = Field(default="")

class ParamsNewFile(BaseModel):
    path: str
    name: str
    version: Optional[str] = Field(default="0.0.1")
    egbenz_version: Optional[str] = Field(default="0.0.1")

class ResponseNewFile(BaseModel):
    status: bool
    message: Optional[str] = Field(default="")

class ParamFolders(BaseModel):
    paths: List[str]

class ResponseFolders(BaseModel):
    status: bool
    message: Optional[str] = Field(default="")
    folders: Optional[List] = Field(default=[])

class ParamsDelete(BaseModel):
    path: str

class ResponseDeletePath(BaseModel):
    status: bool
    message: Optional[str] = Field(default="")

class ParamRename(BaseModel):
    path: str
    name: str

class ResponseRenamePath(BaseModel):
    status: bool
    message: Optional[str] = Field(default="")

class ParamUpdateFile(BaseModel):
    path: str
    doc: Dict

class ResponseUpdateFile(BaseModel):
    status: bool
    message: Optional[str] = Field(default="")

DEFAULT_OPEN_PATH = "所有笔记"

def _path_fix(path):
    # 如果path前缀存在如'所有笔记/'字符串，则去掉
    if path.startswith(DEFAULT_OPEN_PATH + '/'):
        path_arr = path.split('/')
        path = os.path.join(*path_arr[1:])
        # 如果是Linux，同时path首字母不是'/'开头
        if sys.platform != "win32" and not path.startswith('/'):
            path = '/' + path
        # 如果工作目录存在，则拼接工作目录
        path_prefix = global_obj.config.get('工作目录')
        if path_prefix:
            if os.path.exists(path_prefix):
                # 如果path是'/'开头，则去掉
                if path.startswith('/'):
                    path = path[1:]
                path = os.path.join(path_prefix, path)
    return path

def _path_dirname(path):
    # 如果存在文件名去掉，只返回路径
    if os.path.isfile(path):
        return os.path.dirname(path)
    return path

def _filename_rename(name):
    # 如果name不是.ai结尾返回false
    if not name.endswith('.ai'):
        return False
    return True

def file_is_hidden(path):
    """判断文件是否是隐藏文件
    """
    if os.name == 'nt':
        try:
            file_attr = os.stat(path).st_file_attributes
        except:
            return False

        if file_attr & stat.FILE_ATTRIBUTE_HIDDEN:
            return True
        else:
            return False
    else:
        return path.startswith('.')

def _get_folder(path):
    """获取文件夹下的所有文件和文件夹
    """
    result = []
    for file in os.listdir(path):
        if file_is_hidden(os.path.join(path,file)):
            continue
        # 获取文件或文件夹的完整路径
        file_path = os.path.join(path, file)
        # 获取文件或文件夹的最后修改时间
        update_time = time.localtime(os.path.getmtime(file_path))
        # 将时间转换为字符串格式
        update_time_str = time.strftime('%Y-%m-%d %H:%M:%S', update_time)
        # 根据路径是一个文件还是文件夹来判断
        if os.path.isfile(file_path):
            file_type = 'file'
        else:
            file_type = 'folder'
        file_abs_path = os.path.abspath(file_path)
        # 构造结果字典
        file_info = dict(name=file, update_time=update_time_str, type=file_type, path=file_abs_path)
        # 将文件信息添加到结果列表
        result.append(file_info)

    result.sort(key=lambda x: (1 if x['type']=='file' else 0, x['name']))
    return result

def _get_root_path():
    """获取windows/linux系统的根目录下文件
    """
    config = global_obj.config.get_all()
    # 如果config['工作目录']存在，则返回config['工作目录']下的文件
    if '工作目录' in config:
        path = config['工作目录']
        if os.path.exists(path):
            return _get_folder(path)

    result = []
    if sys.platform == "win32":
        for i in range(65, 91):
            drive = chr(i) + ":\\"
            if os.path.exists(drive):
                result.append({"name": drive, "type": "folder", "path": drive})
    else:
        result.append({"name": "/", "type": "folder", "path": "/"})
    return result

def get_all_files(params: ParamsPath):
    path = params.path
    result = []

    # 如果path_arr长度=1且path_arr[0] == '所有笔记',则windows返回所有盘符,linux返回'/'根目录
    if path == '所有笔记':
        result = _get_root_path()
        return parse_obj_as(ResponsePath, {"status":True, "files": result})
    
    # 去掉path_arr第一个元素,重新拼接成新的path
    path = _path_dirname(_path_fix(params.path))
    if not os.path.exists(path):
        return parse_obj_as(ResponsePath, {"status":False, "message": f"'{path}'不存在"})
    # 判断路径是否为目录
    if os.path.isdir(path): 
        result = _get_folder(path)
        name = os.path.basename(path)
        return parse_obj_as(ResponsePath, {"status":True, "name": name, "path": params.path, "files": result})
    else:
        return parse_obj_as(ResponsePath, {"status":False, "message": f"'{path}'不存在"})

def get_folders(params: ParamFolders):
    result = []
    try:
        for path in params.paths:
            if path == '所有笔记':
                r = {
                    "name": "所有笔记",
                    "path": "所有笔记",
                    "files": _get_root_path()
                }
                result.append(r)
            else:
                fixed_path = _path_dirname(_path_fix(path))
                if os.path.isdir(fixed_path):
                    r = {
                        "name": os.path.basename(fixed_path),
                        "path": path,
                        "files": _get_folder(fixed_path)
                    }
                    result.append(r)
        return parse_obj_as(ResponseFolders, {"status":True, "folders": result})
    except Exception as e:
        return parse_obj_as(ResponseFolders, {"status":False, "message": f"获取文件夹失败:{e}"})

def get_file(params: ParamsFile):
    path = _path_fix(params.path)

    if os.path.isfile(path):
        # 获取文件后缀名
        file_ext = os.path.splitext(path)[-1]
        if file_ext == '.ai':
            with open(path, 'r', encoding='utf8') as f:
                try:
                    file_json = json.load(f)
                    return parse_obj_as(ResponseFile, {
                        "status":True
                        , "type":"file"
                        , "name": os.path.basename(f.name)
                        , "path": params.path
                        , "update_time": os.path.getmtime(f.name)
                        , "doc": file_json
                    })
                except Exception as e:
                    print(traceback.format_exc())
                    return parse_obj_as(ResponseFile, {
                        "status":False
                        , "type": "unknow"
                        , "message": "文件格式不正确"
                    })
        else:
            return parse_obj_as(ResponseFile, {
                "status":False
                , "type": "unknow"
                , "message": "不能打开.ai以外的文件"
            })
    else:
        return parse_obj_as(ResponseFile, {
            "status":False
            , "type": "unknow"
            , "message": "文件不存在"
        })

def new_ai_file(params: ParamsNewFile):
    """创建一个.ai文件
    """
    path = _path_dirname(_path_fix(params.path))
    name = params.name
    version = params.version
    egbenz_version = params.egbenz_version
    if not _filename_rename(name):
        return parse_obj_as(ResponseNewFile, {"status":False, "message":"创建失败,文件名不是以.ai结尾的文件"})

    # 创建新的json文件内容
    new_ai = {
    "name": "aditor",
    "type": "child",
    "style": {},
    "data": {
        "version": version,
        "egbenz_version": egbenz_version
    },
    "children": [
        {
            "name": "aditorParagraph",
            "type": "child",
            "style": {},
            "data": {},
            "children": [{
                "name": "aditorText",
                "type": "leaf",
                "style": {},
                "data": {
                    "text": ""
                },
                "children": []
            }]
        }
    ]
}

    # 创建目标文件路径
    target_path = os.path.join(path, name)
    if os.path.exists(target_path):
        return parse_obj_as(ResponseNewFile, {"status":False, "message":"创建失败,文件已存在"})
    
    # 将新文件内容保存到指定文件路径
    with open(target_path, "w") as f:
        json.dump(new_ai, f)

    return parse_obj_as(ResponseNewFile, {"status":True, "message":"创建文件成功"})

def new_folder(params: ParamsNewFolder):
    new_folder = os.path.join(_path_dirname(_path_fix(params.path)), params.name)
    if os.path.exists(new_folder):
        return parse_obj_as(ResponseNewFolder, {"status":False, "message":"创建失败,文件夹已存在"})
    
    os.makedirs(new_folder)
    return parse_obj_as(ResponseNewFolder, {"status":True, "message":"创建文件夹成功"})

def delete_path(params: ParamsDelete):
    path = _path_fix(params.path)
    if os.path.exists(path):
        if os.path.isfile(path):
            os.remove(path)
        else:
            # 强制删除，即使目录不为空
            import shutil
            shutil.rmtree(path, ignore_errors=True)
        return parse_obj_as(ResponseDeletePath, {"status":True, "message":"删除成功"})
    else:
        return parse_obj_as(ResponseDeletePath, {"status":False, "message":"删除失败,文件不存在"})

def rename_path(params: ParamRename):
    path = _path_fix(params.path)
    name = params.name

    new_path = os.path.join(os.path.dirname(path), name)
    if os.path.exists(new_path):
        return parse_obj_as(ResponseRenamePath, {"status":False, "message":"重命名失败,文件已存在"})

    os.rename(path, new_path)
    return parse_obj_as(ResponseRenamePath, {"status":True, "message":"重命名成功"})

def update_file(params: ParamUpdateFile):
    path = _path_fix(params.path)
    doc = params.doc
    
    # 检查path后缀是否是.ai结尾，否则返回错误，不符合格式
    if not path.endswith('.ai'):
        return parse_obj_as(ResponseUpdateFile, {"status":False, "message":"创建失败，不是.ai结尾的文档"})

    # 如果文档不存在，则创建
    if not os.path.exists(path):
        with open(path, 'w') as f:
            json.dump(doc, f)

        return parse_obj_as(ResponseUpdateFile, {"status":True, "message":"保存文件成功"})

    # 如果文档存在则更新文档
    with open(path, 'w') as f:
        json.dump(doc, f)
    return parse_obj_as(ResponseUpdateFile, {"status":True, "message":"保存文件成功"})




