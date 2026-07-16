# 仓库工作指南

## 协作方式

### 语言与教学

- 默认使用中文交流和撰写说明；代码、命令、标识符和专有名词保留原文。
- 项目目标不仅是完成应用，也包括理解 Electron、IPC、DOM、CSS、JavaScript、文件监听和数据流。
- 修改代码时应解释改动原因、运行机制和相关知识点，不能只汇报结果。

### 修改文件前必须确认

每次修改文件前，先向用户说明：

1. 要解决什么问题；
2. 为什么需要修改这些文件；
3. 修改后会带来什么效果；
4. 涉及哪些关键知识点。

只有用户明确确认后才能修改文件。推荐节奏为：说明问题 → 指出文件 → 解释知识点 → 用户确认 → 小步修改 → 运行验证 → 讲解代码。

### GitHub 远程操作确认

执行 `git push`、删除远程分支、创建或合并 Pull Request，以及其他会更新 GitHub 远程状态的操作前，必须获得用户明确确认。未确认时只能进行本地检查、创建本地分支、暂存或本地提交。用户已经针对该次具体操作授权时，不必重复询问。

### Superpowers 使用边界

- 默认不使用任何 `superpowers:*` 技能。
- 仅当用户明确要求，或更高优先级指令强制要求时使用。
- 必须使用时，先说明原因，只加载完成当前任务所需的最少技能和辅助文件。
- 常规问答、小型修改和普通验证，不自动串联头脑风暴、规划、调试、测试或审查技能。

## 问题事实来源与续接入口

GitHub Issue 是问题、讨论、验收条件和完成状态的唯一事实来源。不要在仓库文档中维护内容重复的 Issue 清单或逐任务完成日志。开始处理问题前，优先读取对应 Issue 及最新评论；无法访问时应明确说明，不能把读取失败解释为没有问题。

- 未关闭问题：[GitHub Issues](https://github.com/WL-tea/animal/issues?q=is%3Aissue%20state%3Aopen)
- 当前续接方向：完成托盘单击唤起后，核对 Issue #20、#27 的剩余验收范围，再处理 Issue #1 多显示器拖动与 Issue #5 透明区域点击穿透。
- 非阻塞优化：合并文件监听事件中的重复快照发布；增加“标准输入格式错误且强制写入失败”的子进程级测试。

## 当前架构快照

本项目是基于 Electron 的功能型桌面宠物，渲染层使用原生 HTML、CSS 和 JavaScript。

### 窗口、托盘与生命周期

- 宠物和详情使用独立 `BrowserWindow`；宠物透明、无边框且不占任务栏，详情是可调整大小的普通工作窗口。
- 系统托盘提供显示/隐藏桌宠、打开详情、打开设置、切换宠物永久置顶和退出应用。
- 托盘左键单击显示并唤起桌宠；右键打开原生菜单；双击暂不绑定独立动作。
- 唤起桌宠会复用现有窗口，在位置不可见时恢复到鼠标所在显示器，并一次性显示、聚焦和前置；不得修改持久化置顶偏好。
- `app` 拥有唯一 `CCMonitor` 和 `Tray`。隐藏宠物或关闭详情不会停止监控；托盘“退出”或宠物窗口 Alt+F4 才退出应用并释放资源。
- 详情窗口离开所有显示器可见区域或显示器发生变化时，应恢复到可见工作区。

### 设置与 IPC

- 当前设置结构为 `{ version: 2, projects: [], petAlwaysOnTop: true }`，旧配置读取时安全迁移。
- 设置保存在 `app.getPath("userData")/settings.json`，通过同目录临时文件和 `rename` 原子写入，不属于仓库文件。
- 设置链路为：`Tray / settings.js -> main.js / preload.js 固定 API -> settings-store.js -> userData/settings.json -> CCMonitor / petWindow`。
- `preload.js` 只暴露固定能力，不向渲染页面开放任意 IPC channel。托盘打开设置使用固定的 `settings:open` 通知。

### Claude Code 数据流与安全边界

- 数据流为：`Claude Code statusLine -> claude-statusline-bridge.js -> data/cc-sessions -> cc-monitor.js -> main.js -> 宠物窗口 / 详情窗口`。
- 快照只保存界面需要的白名单字段，不保存提示词、回复、transcript、凭据或其他不必要的隐私数据。
- 每个会话使用独立 UUID 快照，并校验会话 ID、文件名和目标路径，防止目录穿越。
- 数据缺失、损坏或监听故障应安全降级，不能让单个坏文件阻塞其他有效数据源。
- 所有来自文件、IPC、配置或外部工具的字符串都视为不可信数据。优先使用 `textContent`；必须生成 HTML 时按输出上下文转义。
- Claude Code `statusLine` 是用户级外部配置，不属于仓库状态；仓库移动后需要同步更新其命令路径。

## 模块职责

- `main.js`：创建宠物窗口、详情窗口和系统托盘；广播 CC 更新；管理应用级监控器、窗口显示状态和退出生命周期。
- `preload.js`：向渲染进程暴露受控的 `window.ccAPI`、`window.settingsAPI` 和 `window.windowAPI`。
- `settings-store.js`：读取、迁移、规范化并原子保存用户设置。
- `claude-statusline-bridge.js`：读取 Claude Code `statusLine` 标准输入，生成隐私白名单允许的会话快照。
- `cc-monitor.js`：读取和合并 CC 数据，处理 Windows 路径、异常快照、备份来源和监听恢复。
- `renderer/index.html`：宠物窗口页面入口。
- `renderer/detail-window.html`：详情与设置窗口页面入口。
- `renderer/js/app.js`：页面级事件能力、CC 状态和告警判断，不直接负责具体 UI DOM。
- `renderer/js/pet.js`：宠物位置、拖拽、走动和交互。
- `renderer/js/bubble.js`：气泡文本、显示隐藏、计时和定位。
- `renderer/js/detail.js`：详情面板数据渲染。
- `renderer/js/settings.js`：设置面板、项目配置异步状态和主进程打开设置请求。
- `renderer/css/`：宠物、气泡、详情和设置外观。
- `assets/tray/`：托盘图标源图和常用尺寸资源；当前 A 方案是可替换草稿。
- `docs/notes/`：可复用的学习笔记，不承担 Issue 状态跟踪。
- `docs/superpowers/specs/`：产品与架构设计文档；目录名是历史命名，不代表日常任务必须调用 Superpowers。

## 架构原则

- 交互采用宠物本体、临时气泡、详情/设置三层模型，保持“宠物是主角”。
- 模块之间优先通过 `app.js` 事件总线通信，遵循单向数据流和“谁负责 UI，谁操作对应 DOM”。
- 当前主要页面事件包括 `detail:open`、`bubble:say`、`pet:moved` 和 `cc:update`。
- HTML 保留结构，CSS 负责外观，JavaScript 负责行为；原始数字用于计算，格式化结果只用于展示。
- 窗口、托盘、监听器和定时器必须有明确所有者，并在对应生命周期结束时释放。
- 隐藏窗口、关闭普通窗口和退出应用是不同操作，不得混用。

## Git 与交付流程

1. 从干净、同步的 `main` 创建一个对应单一 Issue 或清晰主题的短分支。
2. 小步实现并运行与风险相称的验证，不混入无关文件。
3. 第一批有意义的提交可创建 Draft PR；功能和验收完成后再转为 Ready。
4. PR 描述用户可见行为、主要模块、验证结果和关联 Issue；界面变化按需要附截图。
5. 合并前检查 `AGENTS.md` 是否仍准确。只有架构、协作流程、关键限制或续接入口发生变化时才更新；不要追加逐任务日志、提交清单或可从 GitHub 查询的历史。
6. 确认远端 PR 包含必要说明且验收通过后再合并；合并后同步 `main` 并清理不再需要的本地和远程功能分支。

远程操作仍必须遵守单独确认规则。`main` 始终代表稳定、可运行、可继续开发的基线。

## 构建、测试与验证

- `npm install`：安装 Electron 和项目依赖。
- `npm start`：启动 Electron 应用。
- `npm run start:node`：用 Node 运行 `main.js`，再转交给 Electron。
- `npm run check:electron`：检查 Electron 包在普通 Node 环境中的解析结果。
- `npm test`：串行运行当前 8 个 Node 测试脚本。
- `node --check <file>`：检查单个 JavaScript 文件语法。

项目当前没有 `build` 脚本，不要宣称或运行 `npm run build`。

- 纯文档改动：至少运行 `git diff --check`，复核链接、命令和 Git 状态。
- JavaScript 改动：运行相关文件的 `node --check` 和 `npm test`。
- Electron 生命周期、UI 或 CC 数据改动：除自动测试外，运行 `npm start` 并完成对应手动验收。
- 安全相关改动：确认快照不含隐私字段、外部字符串不会被解释成 HTML、坏数据源不会阻塞其他有效数据。

提交或交接前必须说明实际运行的验证和结果；未运行的测试要明确标注，不能用推测代替。

## 优先阅读

- `README.md`：运行方式、当前功能和配置入口。
- `docs/superpowers/specs/2026-07-01-desktop-pet-design.md`：产品定位、路线与模块通信原则。
- `docs/superpowers/specs/2026-07-10-claude-statusline-monitor-design.md`：statusLine 数据桥接、隐私边界与监控恢复。
- `docs/notes/00-学习地图与协作方式.md`：学习阶段和协作节奏。
- `docs/notes/04-暴露与事件总线.md`、`06-CC数据入口与单向数据流.md`：事件总线和数据流。
- `docs/notes/09-分层测试与GitHub验收.md`：测试和 GitHub 验收方式。
- `docs/notes/10-文件监听故障与不可信数据.md`、`11-innerHTML与外部字符串.md`：故障恢复与安全渲染。
- `docs/notes/12-用户配置、安全IPC与派生状态.md`：设置、IPC 和路径状态。
- `docs/notes/13-多窗口职责与独立置顶.md`：多窗口、置顶和窗口生命周期。
- `docs/notes/15-系统托盘与应用生命周期.md`：托盘交互、任务栏策略和应用级资源所有权。
