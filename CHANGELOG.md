# 更新日志
## [0.1.3] - 2024-06-13
### Done
* 大幅调整命令菜单
* 新增aditorMindma

## [0.0.7] - 2024-05-26
### Done
* 已调整link模块功能和插入方式
* 增加AditorCode,AditorQuote块
* 后端增加md2aditor功能
* 优化EditorToolbar获取段落属性功能
* 新增codeMirror,vue-codemirror依赖

### TODO
* 增加paste的AditorCode parse

## [0.0.6] - 2024-05-21
### Done
* 绘图下方可以清除当前已输出图片
* 使用统一的状态更新函数保存输出的图片，避免无法进入history
* 增加PDF按页解析
* 增加百度等API接口
* 修正配置block的展示（名称不全）
* 极大优化menu状态控制

### TODO
* 旧link已删除，调整link模块功能和插入方式


## [0.0.5] - 2024-05-16
### Done
* AditorCanvas绘图后再自身下方插入图片
* 增加全局进度条
* AditorCanvas增加中断绘画功能
* AditorAIChat增加切换模型功能
* 优化了python包的版本管理
* 保持sd模型返回的 messeage 错误的拼写

### TODO
* 绘图下方可以清除当前已输出图片
* 使用统一的状态更新函数保存输出的图片，避免无法进入history
* 增加PDF按页解析
* 增加百度等API接口
* 修正配置block的展示（名称不全）


## [0.0.4] - 2024-05-12
### Done
* 修改App.vue布局,同步调整Explorer.ts
* 修正关闭标签时toolbar不关闭问题
* 修正相对路径新建文件和文件夹错误问题

### TODO
* AditorCanvas绘图后再自身下方插入图片
* 增加全局进度条
* AditorCanvas增加中断绘画功能
* AditorAIChat增加切换模型功能

## [0.0.4] - 2024-04-23
### TODO

* 请求时正确解析公式给AI
* 调试AI绘图后端（包括命令栏）
* 增加传统翻译功能

## [0.0.3] - 2024-04-22

### TODO

* 修正块元素下Prefix命令第二次触发范围改变问题

## [0.0.2] - 2024-04-21

### TODO

* 修正AditorCanvas请求逻辑，替换为aditorAICahtUtils工具包
* 优化回车后元素如果超出屏幕没有自动定位问题

## [0.0.1] - 2024-04-15

### 新增

### 修复

### 优化

### 已删除

### TODO

* AditorCanvas增加进度条
* 手写 AditorCanvas.appendResource 逻辑
* 调整 AI解释和翻译的 插入逻辑


## [0.0.0] - 2024-03-26

### 新增

### 修复

### 优化

* EditorToolBar不需要手动传入组件默认data,Aditor迭代为新增defaultData字段

### 已删除

### TODO

* 优化EditorToolBar Prefix模式判断条件，需要递归到直接根节点，插入时才能更准确，删除最后一行时不会删除最后一行
