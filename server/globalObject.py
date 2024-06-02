import os, sys 

file_path = os.path.abspath(__file__)
sys.path.append(file_path)

class GlobalObject:
    def __init__(self):
        pass

    def register(self, name, obj):
        setattr(self, name, obj)
    
    def unregister(self, name):
        delattr(self, name)
        
# 初始化全局对象
global_obj = GlobalObject()