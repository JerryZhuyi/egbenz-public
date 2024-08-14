import os

# 这个函数用于检查基础的环境安装
def check_and_install_requirements(uss_mirror=False):
    
    import pkg_resources
    import subprocess
    # 读取requirements.txt文件
    try:
        with open('requirements.txt', 'r', encoding='utf-16') as f:
            requirements = f.read().splitlines()
    except FileNotFoundError:
        # 获取当前执行路径
        current_path = os.path.dirname(os.path.abspath(__file__))
        print(f'No requirements.txt file found in {current_path}. Please make sure you have a requirements.txt file in the same directory as the script.')
        return
    except Exception as e:
        print(f'An error occurred while reading the requirements.txt file: {e}')
        return
    
    # 检查每个包是否已经安装
    for requirement in requirements:
        try:
            # 尝试导入包
            pkg_resources.get_distribution(requirement)
            print(f'{requirement} is installed')
        except pkg_resources.DistributionNotFound:
            print(f'{requirement} NOT installed')

    # 安装requirements.txt中的所有包
    if uss_mirror:
        subprocess.check_call(["python", '-m', 'pip', 'install', '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple/', '-r', 'requirements.txt'])
    else:
        subprocess.check_call(["python", '-m', 'pip', 'install', '-r', 'requirements.txt'])
