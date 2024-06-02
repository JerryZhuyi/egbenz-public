# Introduction
Egbenz, enabling everyone to harness the power of AI.

# Current Version
0.1.0: Beta version

# Compilation & Installation
## Linux & Windows
Installation on Windows and Linux is the same; the required pre-environments for each platform, such as conda, cuda, git, etc., need to be installed separately.

Adjust the "cd" command according to the platform

```bash
git clone this project

# Enter the directory of the project you just cloned
cd this project

# Install frontend dependencies
npm install

# Compile your frontend code
npm run build

# Create a new 3.10.6 version python virtual environment
conda create -n eg2_python python=3.10.6

# Activate your virtual environment
conda activate eg2_python

# Start installation, -i installs dependencies, -ie installs extension package dependencies (including sd2 and vits dependencies)
python app.py -i -ie

# After installation, the sd and vits versions will not start, so restart
# The following command will start three services on your local machine, the main server, sd server, and vits server
python app.py -sd -vits

```

## Model Download
Before downloading models, make sure you have executed the -i -ie commands (these commands are related to server-side code and folders)
### SD Model
After downloading, please place it in the following directory
```bash
egbenz2 root directory/server/apis/stable-diffusion-webui/models/Stable-diffusion/your_model.ckpt
```
### SD-VAE Model
After downloading, please place it in the following directory
```bash
egbenz2 root directory/server/apis/stable-diffusion-webui/models/VAE/your_VAE_model.safetensors
```

### ControlNet Model (optional)
If you need to use functions such as image expansion and redraw, make sure you have the following ControlNet models
control_v11p_sd15_inpaint
ControlNetLama
control_v11f1e_sd15_tile
Three models

Download link: https://huggingface.co/lllyasviel/ControlNet-v1-1/tree/main
After downloading, please place them in:
```bash
egbenz2 root directory/server/apis/stable-diffusion-webui/extensions/sd-webui-controlnet/models/your_ControlNet_model.pth
```

### Vits Model
Execute the following commands
```bash
# Enter the Vits directory
cd ./server/apis/VITS-fast-fine-tuning/

wget https://huggingface.co/spaces/Plachta/VITS-Umamusume-voice-synthesizer/resolve/main/pretrained_models/D_trilingual.pth -O ./pretrained_models/D_0.pth

wget https://huggingface.co/spaces/Plachta/VITS-Umamusume-voice-synthesizer/resolve/main/pretrained_models/G_trilingual.pth -O ./pretrained_models/G_0.pth

wget https://huggingface.co/spaces/Plachta/VITS-Umamusume-voice-synthesizer/resolve/main/configs/uma_trilingual.json -O ./configs/finetune_speaker.json
```

# How to Configure
Egbenz does not have a dedicated configuration page; configuration components are integrated in the documentation and can be inserted through the menu bar.
Currently includes the following configuration items:

GPT Proxy = Proxy address for GPT requests

ChatGPT Key = GPT API KEY

JUMP URL = GPT jump network, usually used in China

Working Directory = Default directory to open when the tool starts

SD URL = Usually http://localhost:8082, unless deployed separately

VITS URL = Usually http://localhost:8083, unless deployed separately

QianFan API Key = QianFan API KEY

QianFan Secret Key = QianFan Secret KEY

# Contact
Bilibili: https://space.bilibili.com/88417339

Developer Group (please mention 'egbenz' when applying):
![Alt text](04b4826654c1efd29688c1f8aa9285b.jpg)

# Others

## Project Features
1) Open source, free, localized deployment

2) Easily extendable frontend components

3) Non-intrusive programming integration with open source AI projects

# Thanks
To all open-source software organizations & developers