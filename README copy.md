# 介绍
Egbenz，让每个人都可以使用AI的能力。

# 当前版本
0.1.0：内测版本

# 编译&安装
## Linux & Windows
windows和linux安装无区别；只是各个平台所需的前置环境，如conda,cuda,git等请自行安装

其中"cd"命令请根据平台自行微调

```bash
git clone 本项目

# 进入到你刚刚克隆的项目目录
cd 本项目

# 安装前端依赖
npm install

# 编译你的前端代码
npm run build

# 创建一个新的3.10.6版本 python虚拟环境
conda create -n eg2_python python=3.10.6

# 激活你的虚拟环境
conda activate eg2_python

# 启动安装,-i安装依赖, -ie安装扩展包依赖(包括sd2和vits依赖)
python app.py -i -ie

# 安装完成后会启动无sd和vits版本，所以重新启动
# 以下命令会在本机启动三个服务，本体, sd服务器，vits服务器
python app.py -sd -vits

```

## 模型下载
下载模型前，请确保已经执行了-i -ie命令（两个命令是按照服务端相关代码和文件夹）
### SD模型
下载后请放到以下目录
```bash
egbenz2根目录/server/apis/stable-diffusion-webui/models/Stable-diffusion/你的模型.ckpt
```
### SD-VAE模型
下载后请放到以下目录
```bash
egbenz2根目录/server/apis/stable-diffusion-webui/models/VAE/你的VAE模型.safetensors
```

### ControlNet模型（非必须）
如果需要使用扩图，重绘等功能，请确保有以下ControlNet模型
control_v11p_sd15_inpaint
ControlNetLama
control_v11f1e_sd15_tile
三个模型

下载地址: https://huggingface.co/lllyasviel/ControlNet-v1-1/tree/main
下载后请放到：
```bash
egbenz2根目录/server/apis/stable-diffusion-webui/extensions/sd-webui-controlnet/models/你需要的ControlNet模型.pth
```

### Vits模型
执行以下命令
```bash
# 进入到Vits目录
cd ./server/apis/VITS-fast-fine-tuning/

wget https://huggingface.co/spaces/Plachta/VITS-Umamusume-voice-synthesizer/resolve/main/pretrained_models/D_trilingual.pth -O ./pretrained_models/D_0.pth

wget https://huggingface.co/spaces/Plachta/VITS-Umamusume-voice-synthesizer/resolve/main/pretrained_models/G_trilingual.pth -O ./pretrained_models/G_0.pth

wget https://huggingface.co/spaces/Plachta/VITS-Umamusume-voice-synthesizer/resolve/main/configs/uma_trilingual.json -O ./configs/finetune_speaker.json
```

# 如何配置
Egbenz无专门的配置页面；配置组件集成再文档中，可以通过菜单栏插入。
目前包含以下配置项：

GPT Proxy = GPT请求的代理地址

ChatGPT Key = GPT API的KEY

JUMP URL = GPT跳板网络，通常在国内时可以使用

工作目录 = 工具启动时默认打开的目录

SD URL = 一般为http://localhost:8082，除非分离部署

VITS URL = 一般为http://localhost:8083，除非分离部署 

QianFan API Key = 千帆API KEY

QianFan Secret Key = 千帆Secret KEY

# 联系
B站：https://space.bilibili.com/88417339

开发者群（申请时备注'egbenz'）：
微信：wxid_kp82cth86hvf22

# 其他

## 项目特性
1）开源、免费、本地化部署

2）前端组件轻易扩展

3）无侵入编程接入AI开源项目

# 感谢
所有开源软件组织&开发者