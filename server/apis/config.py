
default_config = {
    "GPT Proxy":""
    , "ChatGPT Key":""
    , "JUMP URL":""
    , "工作目录":""
    , "SD URL": "http://localhost:8082"
    , "VITS URL": "http://localhost:8083"
    , "QianFan API Key": ""
    , "QianFan Secret Key": ""
}

class Config:
    def __init__(self, cfg_path):
        self.cfg_path = cfg_path
        self.cfg = {}
        self.load_cfg()

    def load_cfg(self):
        try:
            with open(self.cfg_path, 'r', encoding='utf8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    key, value = line.split('=')
                    self.cfg[key.strip()] = value.strip()

                # 检查是否缺少默认配置
                for key, value in default_config.items():
                    if key not in self.cfg:
                        self.cfg[key] = value
        except FileNotFoundError:
            with open(self.cfg_path, 'w', encoding='utf8') as f:
                for k, v in default_config.items():
                    f.write(f'{k} = {v}\n')
            self.cfg = default_config

    def get_all(self):
        return self.cfg

    def get(self, key):
        return self.cfg.get(key)

    def set(self, key, value):
        self.cfg[key] = value
        with open(self.cfg_path, 'w', encoding='utf8') as f:
            for k, v in self.cfg.items():
                f.write(f'{k} = {v}\n')

    def remove(self, key):
        self.cfg.pop(key)
        with open(self.cfg_path, 'w') as f:
            for k, v in self.cfg.items():
                f.write(f'{k} = {v}\n')

