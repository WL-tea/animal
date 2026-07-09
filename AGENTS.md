# 仓库指南

## 项目结构与模块组织

本仓库是一个基于 Electron 的功能型桌面宠物项目，渲染层使用原生 HTML、CSS 和 JavaScript。

- `main.js`：Electron 主进程，负责创建透明置顶窗口并启动 CC 监控。
- `preload.js`：安全 IPC 桥接层，向渲染进程暴露 `window.ccAPI`。
- `cc-monitor.js`：Node 侧 Claude Code 数据读取与文件监听模块。
- `renderer/index.html`：渲染进程入口页面。
- `renderer/css/`：桌宠本体、气泡、详情面板和后续设置面板样式。
- `renderer/js/`：渲染进程页面行为。当前已有 `app.js` 事件总线、`pet.js` 桌宠移动/拖拽、`bubble.js` 气泡显示/定位、`detail.js` 详情渲染；后续继续拆分 `settings.js`、`pet-states.js`。
- `docs/superpowers/specs/`：产品与架构设计文档。
- `docs/notes/`：学习笔记，记录 Node.js、Electron、CSS/JS 分工、事件驱动、Git 分支与提交节奏等概念。

运行时用户数据应放在 `data/` 下，并默认保持忽略，除非明确需要提交。

## 构建、测试与开发命令

- `npm install`：安装 Electron 和项目依赖。
- `npm start`：通过 Electron 启动桌宠应用。
- `npm run start:node`：用 Node 运行 `main.js`，再自动转交给 Electron。
- `npm run check:electron`：检查当前 Electron 包在 Node 中的解析结果。
- `node --check <file>`：检查 JavaScript 语法，例如 `node --check renderer/js/detail.js`。

当前项目还没有配置 `build` 脚本或自动化测试脚本。

## 代码风格与命名约定

JavaScript、HTML 和 CSS 统一使用 4 空格缩进。保持模块职责清晰：主进程和文件系统逻辑放在根目录 Node 文件中，界面交互逻辑放在 `renderer/js/` 中。JavaScript 变量和函数使用清晰的 camelCase 命名。

优先使用简单 DOM API，不要在项目计划未变化时引入前端框架。计算逻辑和展示格式要分开：先用原始数字计算，再用 `toLocaleString()` 等方法格式化给界面显示。

HTML 尽量只保留结构，外观交给 CSS，行为交给 JS。桌宠本体应保持“宠物是主角”：不要把说明文字直接贴在宠物身上。

## 测试指南

目前没有正式测试框架。提交或交接改动前，至少对改过的 JavaScript 文件运行语法检查，并手动验证 Electron 启动：

```bash
npm start
node --check main.js
```

涉及 UI 的改动需要验证三个场景：启动后只显示桌宠本体、双击后打开详情面板、详情面板能显示 CC 数据。

## 提交与 Pull Request 指南

现有提交使用简短中文摘要，可带 emoji，例如 `📖 添加 README`。后续提交应保持简洁，说明本次改动的目的。Pull Request 需要描述用户可见行为、列出主要改动模块；涉及界面变化时应附截图。

推荐 Git 节奏：一个学习主题或功能使用一个清晰分支名，例如 `event-bus`、`settings-panel`、`cc-alerts`；一个可解释的小目标完成并通过基本验证后再提交。提交前检查是否能用一句话说明改动、是否运行过必要的 `node --check`、是否混入不相关文件、是否需要新增或更新 `docs/notes/` 学习笔记。

## 架构与学习说明

项目目标不仅是完成应用，也包括理解 Electron、IPC、DOM、CSS、文件监听和数据流。交互采用三层模型：宠物本体、临时对话气泡、详情/设置窗口。

目标架构是事件驱动和单向数据流：`cc-monitor -> app.js -> 各 UI 模块`。模块之间不应直接互相调用；新增功能优先通过 `app.js` 事件总线转发。当前实现仍处于 MVP 过渡阶段，若临时绕过目标结构，应在代码或交接说明中标明原因。

当前已落地的渲染层事件包括：

- `detail:open`：请求打开详情面板，由 `detail.js` 监听并执行打开逻辑。
- `bubble:say`：请求气泡显示一句话，由 `bubble.js` 监听并负责显示、隐藏和计时。
- `pet:moved`：宠物位置发生变化，由 `bubble.js` 监听并重新定位气泡。

模块职责边界按“谁负责 UI，谁操作 DOM”执行：`pet.js` 只负责 `#pet` 的位置、拖拽、走动和宠物交互；`bubble.js` 只负责 `#bubble` 的文字、显示隐藏和定位；`detail.js` 只负责 `#detail-panel` 及其内部渲染；`app.js` 只负责公共事件能力和后续页面级状态，不应塞入具体 UI 渲染细节。

贡献者修改代码时，应解释改动原因、运行机制和相关知识点，而不仅是汇报结果。推荐流程是：说明问题、指出相关文件、解释知识点、改一小步、运行验证、判断是否需要新增学习笔记。

遇到对初学者重要、可复用的知识点时，应在 `docs/notes/` 新增或更新学习笔记，文件名按 `序号-主题.md` 命名，例如 `03-启动调试与数据流问题.md`。学习路线和协作方式详见 `docs/notes/00-学习地图与协作方式.md`。
