# 全局变量请放在最开头
from server.globalObject import global_obj

import os,sys
import argparse

from server.install import check_and_install_requirements
from server.install_extension import init_repo, init_model_from_local, install_monotonic_align
from multiprocessing import Process

# 获取当前入口文件的路径
file_path = os.path.abspath(__file__)
# 获取当前项目的根目录
root_path = os.path.dirname(file_path)
# 拼接Config文件地址
egbenz_config_path = os.path.join(root_path, "egbenz.config.cfg")

class EgbenzServer():
    def __init__(self) -> None:
        from server.apis.config import Config
        global_obj.register('config', Config(egbenz_config_path))
        global_obj.register('server', self)

    def startServer(self, port=8080, dev=False):
        from fastapi import FastAPI, Response, APIRouter, Depends, Request
        import uvicorn

        import server.apis.file_manage as fileRoute
        from server.apis.route import EgbenzRouter
        from server.apis.chatgpt import route_chat, ResponseChat

        from fastapi.responses import FileResponse
        def get_vite_svg():
            return FileResponse("dist/vite.svg")

        self.app = FastAPI()
        self.router = APIRouter()

        if not dev:
            from fastapi.staticfiles import StaticFiles
            from fastapi.templating import Jinja2Templates
            from fastapi.responses import HTMLResponse

            self.app.mount("/assets", StaticFiles(directory="dist/assets/"), name="static")
            self.app.mount("/images", StaticFiles(directory="images/"), name="images")
            templates = Jinja2Templates(directory="dist")
            async def read_root(request: Request):
                return templates.TemplateResponse("index.html", {"request": request})

            self.app.add_api_route("/", read_root, response_class=HTMLResponse)
            self.app.add_api_route("/vite.svg", get_vite_svg)

        self.app.add_api_route("/files", fileRoute.get_all_files, methods=["POST"], response_model=fileRoute.ResponsePath)
        self.app.add_api_route("/file", fileRoute.get_file, methods=["POST"], response_model=fileRoute.ResponseFile)
        self.app.add_api_route("/new_folder", fileRoute.new_folder, methods=["POST"], response_model=fileRoute.ResponseNewFolder)
        self.app.add_api_route("/new_ai_file", fileRoute.new_ai_file, methods=["POST"], response_model=fileRoute.ResponseNewFile)
        self.app.add_api_route("/update_file", fileRoute.update_file, methods=["POST"], response_model=fileRoute.ResponseUpdateFile)
        self.app.add_api_route("/refresh", fileRoute.get_folders, methods=["POST"], response_model=fileRoute.ResponseFolders)
        self.app.add_api_route("/delete_path", fileRoute.delete_path, methods=["POST"], response_model=fileRoute.ResponseDeletePath)
        self.app.add_api_route("/rename_path", fileRoute.rename_path, methods=["POST"], response_model=fileRoute.ResponseRenamePath)
        
        self.app.add_api_route("/chatgpt", route_chat, methods=["POST"], response_model=ResponseChat)
        self.egbenzRouter = EgbenzRouter(self.app)

        self.app.include_router(self.router)

        uvicorn.run(self.app, host="0.0.0.0", port=port)

class StableServer():
    def __init__(self) -> None:
        pass
    
    def startSever(self, port=8081):
        from fastapi import FastAPI, Response, APIRouter, Depends, Request
        import uvicorn
        sys.path.append(os.path.join(os.path.abspath(os.path.dirname(__file__)), "server/apis/stable-diffusion-webui"))
        from server.apis.stable_diffusion_hijack.hijack_api import hijackApi
        self.hijackApi = hijackApi
        self.app = FastAPI()
        self.router = APIRouter()
        self.sd_api = self.hijackApi(self.app)
        self.app.include_router(self.router)
        uvicorn.run(self.app, host="0.0.0.0", port=port)

class VitsServer():
    def __init__(self) -> None:
        pass

    def startServer(self, port=8083):
        from fastapi import FastAPI, Response, APIRouter, Depends, Request
        import uvicorn
        sys.path.append(os.path.join(os.path.abspath(os.path.dirname(__file__)), "server/apis/VITS-fast-fine-tuning"))
        from server.apis.VITS_fast_fine_tuning_hijack.vits_hijack import VITSHijack
        self.VITSHijack = VITSHijack
        self.app = FastAPI()
        self.router = APIRouter()
        self.vits = self.VITSHijack(self.app)
        self.app.include_router(self.router)
        uvicorn.run(self.app, host="0.0.0.0", port=port)

def start_main_server(port=8080, dev=False):
    server = EgbenzServer()
    server.startServer(port, dev)

def start_sd_server(port=8082):
    server = StableServer()
    server.startSever(port)

def start_vits_server(port=8083):
    server = VitsServer()
    server.startServer(port)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Egbenz Server')
    parser.add_argument('-i', '--enable_install', help='Whether to perform installation check', action='store_true')
    parser.add_argument('-sd', '--enable_sd', help='Whether to start stable diffusion webui', action='store_true')
    parser.add_argument('-vits', '--vits', help='Whether to start vits', action='store_true')
    parser.add_argument('-p', '--port', help='Port to run the server on', type=int, default=8080)
    parser.add_argument('-ps', '--port_sd', help='Port to run the stable diffusion webui on', type=int, default=8082)
    parser.add_argument('-pv', '--port_vits', help='Port to run the vits on', type=int, default=8083)
    # 是否安装扩展(sd和vits)
    parser.add_argument('-ie', '--install_extension', help='Whether to install extensions', action='store_true')
    # 是否启用Gitee代替Github
    parser.add_argument('-gitee', '--use_gitee', help='Whether to use gitee instead of github', action='store_true')
    # 是否前后端联调模式
    parser.add_argument('-dev', '--dev', help='Whether to use dev mode', action='store_true')
    # 是否使用镜像
    parser.add_argument('-mi', '--mirror', help='Whether to use mirror', action='store_true')


    args = parser.parse_args()

    if args.enable_install:
        check_and_install_requirements(args.mirror)

    if args.install_extension:
        init_repo(args.use_gitee)
        init_model_from_local()
        install_monotonic_align()

    
    server0 = Process(target=start_main_server, args=(args.port,args.dev))
    server0.start()

    if args.enable_sd:
        # 清空当前所有命令参数，防止子进程重复解析
        sys.argv = sys.argv[:1]
        server1 = Process(target=start_sd_server, args=(args.port_sd,))
        server1.start()
    if args.vits:
        # 清空当前命令行参数，防止子进程重复解析
        sys.argv = sys.argv[:1]
        server2 = Process(target=start_vits_server, args=(args.port_vits,))
        server2.start()
