基于Tauri图形界面的一款.claude/CLAUDE.md、.codex/AGENTS.md、.gemini/GEMINI.md文件的快速应用和切换工具

技术架构
前端：静态 HTML/CSS + 原生 JS（index.html、settings.html、js/*）。
后端：Rust（Tauri v2），位于 src-tauri/src/main.rs，通过 Tauri invoke 向前端暴露指令。
打包：src-tauri/tauri.conf.json 配置 Tauri Bundler（目标：dmg/app、nsis、deb）。

主要feature
1. 主页应该有一个下拉菜单，可以切换claude、codex、gemini等等、未来可以增加，无非是增加一个名称和系统提示词文件的路径
2. 主页应该可以显示已选择的客户端claude、codex、gemini当前的提示词，比如左半边，可以直接修改；右半边加载提示词库（下拉菜单），和选中提示词标题的内容；和它对应的tag，可以按tag过滤，如果客户端是claude，此时应该必须要有Claude的tag，其他以此类推；还应该有一个左半边到右半边的箭头图标，表示应用；
3. 应该有一个模版管理页，里面存着这种各样的提示词，可以进行增删改查，方便对提示词进行维护，可以对提示词打各种不同的标签，可以按照标签进行查询
4. 数据、配置等都存在json文件中
