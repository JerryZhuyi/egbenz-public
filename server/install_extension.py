#!/usr/bin/env python
import os,sys
# this scripts installs necessary requirements and launches main program in webui.py
import subprocess
import shutil
import argparse
import pkg_resources

project_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
local_model_path = "/home/ubuntu/models"
default_command_live = (os.environ.get('WEBUI_LAUNCH_LIVE_OUTPUT') == "1")
git = os.environ.get('GIT', "git")
python = sys.executable

def run(command, desc=None, errdesc=None, custom_env=None, live: bool = default_command_live) -> str:
    if desc is not None:
        print(desc)

    run_kwargs = {
        "args": command,
        "shell": True,
        "env": os.environ if custom_env is None else custom_env,
        "encoding": 'utf8',
        "errors": 'ignore',
    }

    if not live:
        run_kwargs["stdout"] = run_kwargs["stderr"] = subprocess.PIPE

    result = subprocess.run(**run_kwargs)

    if result.returncode != 0:
        error_bits = [
            f"{errdesc or 'Error running command'}.",
            f"Command: {command}",
            f"Error code: {result.returncode}",
        ]
        if result.stdout:
            error_bits.append(f"stdout: {result.stdout}")
        if result.stderr:
            error_bits.append(f"stderr: {result.stderr}")
        raise RuntimeError("\n".join(error_bits))

    return (result.stdout or "")

def git_clone(url, dir, name, commithash=None):
    # TODO clone into temporary dir and move if successful
    if os.path.exists(dir):
        if commithash is None:
            return

        current_hash = run(f'"{git}" -C "{dir}" rev-parse HEAD', None, f"Couldn't determine {name}'s hash: {commithash}").strip()
        if current_hash == commithash:
            return

        run(f'"{git}" -C "{dir}" fetch', f"Fetching updates for {name}...", f"Couldn't fetch {name}")
        run(f'"{git}" -C "{dir}" checkout {commithash}', f"Checking out commit for {name} with hash: {commithash}...", f"Couldn't checkout commit {commithash} for {name}")
        return

    run(f'"{git}" clone "{url}" "{dir}"', f"Cloning {name} into {dir}...", f"Couldn't clone {name}")

    if commithash is not None:
        run(f'"{git}" -C "{dir}" checkout {commithash}', None, "Couldn't checkout {name}'s hash: {commithash}")


def __inner_init_repo__(use_gitee=False):
        # 无论在那执行，都把目录切换到项目根目录下
        os.chdir(project_path)

        # 首先检查并安装torch相关依赖
        packages = [
            "torch==2.0.1+cu118",
            "torchvision==0.15.2+cu118",
            "torchaudio==2.0.2+cu118"
        ]
        for package in packages:
            try:
                # 检查包是否已经安装
                pkg_resources.get_distribution(package)
                print(f"{package} 已经安装.")
            except pkg_resources.DistributionNotFound:
                try:
                    subprocess.check_call([sys.executable, "-m", "pip", "install", package, "--index-url", "https://download.pytorch.org/whl/cu118"])
                except subprocess.CalledProcessError as e:
                    print(f"安装 {package} 时出现问题. 请检查你的网络连接.")
                    print(f"错误信息: {e}")
    
        if use_gitee:
            stable_diffusion_webui_repo = os.environ.get('STABLE_DIFFUSION_WEBUI_REPO', "https://gitee.com/jerrylinkun/stable-diffusion-webui.git")
            stable_diffusion_webui_commit_hash = os.environ.get('STABLE_DIFFUSION_WEBUI_COMMIT_HASH', "f865d3e11647dfd6c7b2cdf90dde24680e58acd8")

            sd_webui_controlnet_repo = os.environ.get('SD_WEBUI_CONTROLNET_REPO', "https://gitee.com/jerrylinkun/sd-webui-controlnet.git")
            sd_webui_controlnet_commit_hash = os.environ.get('SD_WEBUI_CONTROLNET_COMMIT_HASH', "07bed6ccf8a468a45b2833cfdadc749927cbd575")

            vits_fast_fine_tuning_repo = os.environ.get('VITS_FAST_FINE_TUNING', "https://gitee.com/jerrylinkun/VITS-fast-fine-tuning.git")
            vits_fast_fine_tuning_commit_hash = os.environ.get('VITS_FAST_FINE_TUNING_COMMIT_HASH', "8b5acbc877fa4add24855c64d1f806189708039f")
        else:
            # 克隆webui
            stable_diffusion_webui_repo = os.environ.get('STABLE_DIFFUSION_WEBUI_REPO', "https://github.com/AUTOMATIC1111/stable-diffusion-webui.git")
            stable_diffusion_webui_commit_hash = os.environ.get('STABLE_DIFFUSION_WEBUI_COMMIT_HASH', "f865d3e11647dfd6c7b2cdf90dde24680e58acd8")

            sd_webui_controlnet_repo = os.environ.get('SD_WEBUI_CONTROLNET_REPO', "https://github.com/Mikubill/sd-webui-controlnet.git")
            sd_webui_controlnet_commit_hash = os.environ.get('SD_WEBUI_CONTROLNET_COMMIT_HASH', "07bed6ccf8a468a45b2833cfdadc749927cbd575")

            vits_fast_fine_tuning_repo = os.environ.get('VITS_FAST_FINE_TUNING', "https://github.com/Plachtaa/VITS-fast-fine-tuning.git")
            vits_fast_fine_tuning_commit_hash = os.environ.get('VITS_FAST_FINE_TUNING_COMMIT_HASH', "8b5acbc877fa4add24855c64d1f806189708039f")

        git_clone(stable_diffusion_webui_repo, 'server/apis/stable-diffusion-webui', "Stable Diffusion Webui", stable_diffusion_webui_commit_hash)
        git_clone(sd_webui_controlnet_repo, 'server/apis/stable-diffusion-webui/extensions/sd-webui-controlnet', "SD Webui Controlnet", sd_webui_controlnet_commit_hash)
        git_clone(vits_fast_fine_tuning_repo, 'server/apis/VITS-fast-fine-tuning', "VITS-fast-fine-tuning", vits_fast_fine_tuning_commit_hash)

        # 初始化webui的环境

        if project_path not in sys.path:
            sys.path.append(project_path)

        # stable-diffusion-webui加入sys.path
        if os.path.join(project_path, "server/apis/stable-diffusion-webui") not in sys.path:
            sys.path.append(os.path.join(project_path, "server/apis/stable-diffusion-webui"))

        import importlib
        launch_utils = importlib.import_module("server.apis.stable-diffusion-webui.modules.launch_utils")


        # 用于替换原来的函数，新建python运行时，把api/stable-diffusion-webui的目录添加到默认包目录
        def run_extension_installer(extension_dir):
            path_installer = os.path.join(extension_dir, "install.py")
            if not os.path.isfile(path_installer):
                return

            try:
                env = os.environ.copy()
                # env['PYTHONPATH'] = os.path.abspath(".") 只把这里修改成下面，且只会在环境准备函数使用
                env['PYTHONPATH'] = os.path.abspath(".") + os.pathsep + os.path.abspath("./server/apis/stable-diffusion-webui")
                
                print(run(f'"{python}" "{path_installer}"', errdesc=f"Error running install.py for extension {extension_dir}", custom_env=env))
            except Exception as e:
                print(e, file=sys.stderr)

        launch_utils.run_extension_installer = run_extension_installer

        launch_utils.prepare_environment()

def init_repo(use_gitee=False):
    # 启动一个新的Process，避免在当前进程中执行，导致环境变量被修改
    import multiprocessing
    p = multiprocessing.Process(target=__inner_init_repo__, args=(use_gitee,))
    p.start()
    p.join()



def init_model_from_local():
    os.chdir(project_path)
    """尝试从本地加载模型
    """
    copy_list = [{
        "source": os.path.join(local_model_path, "anythingV3_fp16.ckpt"),
        "destination": "./server/apis/stable-diffusion-webui/models/Stable-diffusion/anythingV3_fp16.ckpt"
    }
    ,{
        "source": os.path.join(local_model_path, "control_v11p_sd15_inpaint.pth"),
        "destination": "./server/apis/stable-diffusion-webui/extensions/sd-webui-controlnet/models/control_v11p_sd15_inpaint.pth"
    }
    ,{
        "source": os.path.join(local_model_path, "vae-ft-mse-840000-ema-pruned.safetensors"),
        "destination": "./server/apis/stable-diffusion-webui/models/VAE/vae-ft-mse-840000-ema-pruned.safetensors"
    }
    ,{
        "source": os.path.join(local_model_path, "ControlNetLama.pth"),
        "destination": "./server/apis/stable-diffusion-webui/extensions/sd-webui-controlnet/annotator/downloads/lama/ControlNetLama.pth"
    }
    ,{
        "source": os.path.join(local_model_path, "control_v11f1e_sd15_tile.pth"),
        "destination": "./server/apis/stable-diffusion-webui/extensions/sd-webui-controlnet/models/control_v11f1e_sd15_tile.pth"
    }
    # 新增VITS模型相关配置
    ,{
        "source": os.path.join(local_model_path, "G_0.pth"),
        "destination": "./server/apis/VITS-fast-fine-tuning/pretrained_models/G_0.pth"
    }
    ,{
        "source": os.path.join(local_model_path, "D_0.pth"),
        "destination": "./server/apis/VITS-fast-fine-tuning/pretrained_models/D_0.pth"
    }
    ,{
        "source": os.path.join(local_model_path, "finetune_speaker.json"),
        "destination": "./server/apis/VITS-fast-fine-tuning/configs/finetune_speaker.json"
    }
    ]

    for obj in copy_list:
        source = obj['source']
        destination = obj['destination']
        if os.path.exists(destination):
            print("文件'", destination, "'已存在")
        else:
            try:
                destination_folder = os.path.dirname(destination)
                os.makedirs(destination_folder, exist_ok=True)
                shutil.copy(source, destination)
                print("文件'",source,"'成功复制到'",destination,"'")
            except FileNotFoundError:
                print("目标文件夹或文件不存在,请在线下载相关模型文件")


def run(command, desc=None, errdesc=None, custom_env=None, live: bool = default_command_live) -> str:
    if desc is not None:
        print(desc)

    run_kwargs = {
        "args": command,
        "shell": True,
        "env": os.environ if custom_env is None else custom_env,
        "encoding": 'utf8',
        "errors": 'ignore',
    }

    if not live:
        run_kwargs["stdout"] = run_kwargs["stderr"] = subprocess.PIPE

    result = subprocess.run(**run_kwargs)

    if result.returncode != 0:
        error_bits = [
            f"{errdesc or 'Error running command'}.",
            f"Command: {command}",
            f"Error code: {result.returncode}",
        ]
        if result.stdout:
            error_bits.append(f"stdout: {result.stdout}")
        if result.stderr:
            error_bits.append(f"stderr: {result.stderr}")
        raise RuntimeError("\n".join(error_bits))

    return (result.stdout or "")

def install_monotonic_align():
    os.chdir(project_path)

    requirements_file = os.path.join(project_path, 'server/apis/VITS_fast_fine_tuning_hijack/requirements.txt')
    python = sys.executable
    command = f"install -r \"{requirements_file}\""
    desc = "VITS_requirements"
    run(f'"{python}" -m pip {command} --prefer-binary', desc=f"Installing {desc}", errdesc=f"Couldn't install {desc}", live=True)

    # cd monotonic_align
    os.chdir('./server/apis/VITS-fast-fine-tuning/monotonic_align')

    # mkdir monotonic_align
    os.makedirs('monotonic_align', exist_ok=True)

    # python setup.py build_ext --inplace
    os.system('python setup.py build_ext --inplace')

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Egbenz Server')
    # 是否启用Gitee代替Github
    parser.add_argument('-gitee', '--use_gitee', help='Whether to use gitee instead of github', action='store_true')

    args = parser.parse_args()
    init_repo(args.use_gitee)
    init_model_from_local()
    # 安装VITS monotonic_align
    install_monotonic_align()