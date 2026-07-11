# 仓库指南

## 全局协作规则

### 修改前教学确认

每次修改文件前，必须先向用户说明：本次要解决什么问题、为什么需要修改这些文件、修改后会带来什么效果，以及涉及的关键知识点。只有在用户明确确认后，才能开始实际修改文件。

### 当前 Bug 与 GitHub Issue 入口

GitHub Issue 是项目问题的唯一事实来源，不在仓库内维护内容重复的 Issue 说明文档。当前未关闭的问题统一从 [GitHub Issues](https://github.com/WL-tea/animal/issues?q=is%3Aissue%20state%3Aopen) 查看。

开始处理项目问题前，应优先通过 GitHub 连接器读取未关闭的 Issue，并根据 Issue 中的现象、复现步骤、预期行为和相关上下文开展分析。用户在专门的问题记录对话中提出新的具体项目问题时，应将完整问题创建为 GitHub Issue，后续进展和关闭状态也以该 Issue 为准。

如果当前环境无法访问 GitHub Issue，应明确告知用户并重试或请用户提供 Issue 链接与内容；不得将“读取失败”视为“当前没有 Bug”。

## 项目结构与模块组织

本仓库是一个基于 Electron 的功能型桌面宠物项目，渲染层使用原生 HTML、CSS 和 JavaScript。

- `main.js`：Electron 主进程，负责创建透明置顶窗口并启动 CC 监控。
- `preload.js`：安全 IPC 桥接层，向渲染进程暴露 `window.ccAPI`。
- `claude-statusline-bridge.js`：Claude Code `statusLine` 命令入口，读取标准输入、输出状态栏文本，并将经过隐私白名单筛选的会话快照原子写入 `data/cc-sessions/`。
- `cc-monitor.js`：Node 侧 Claude Code 数据读取与文件监听模块，合并旧版累计数据和 `statusLine` 会话快照，并在监听故障后自动恢复。
- `renderer/index.html`：渲染进程入口页面。
- `renderer/css/`：桌宠本体、气泡、详情面板和后续设置面板样式。
- `renderer/js/`：渲染进程页面行为。当前已有 `app.js` 事件总线、`pet.js` 桌宠移动/拖拽、`bubble.js` 气泡显示/定位、`detail.js` 详情渲染；后续继续拆分 `settings.js`、`pet-states.js`。
- `docs/superpowers/specs/`：产品与架构设计文档。
- `docs/notes/`：学习笔记，记录 Node.js、Electron、CSS/JS 分工、事件驱动、Git 分支与提交节奏等概念。

运行时用户数据应放在 `data/` 下，并默认保持忽略，除非明确需要提交。

## 项目计划与续接入口

继续开发前应优先阅读以下文档，避免只看代码而忽略产品计划和学习路线：

- `docs/superpowers/specs/2026-07-01-desktop-pet-design.md`：产品定位、MVP/V2/V3 路线、目标文件结构和模块通信原则。
- `docs/superpowers/specs/2026-07-10-claude-statusline-monitor-design.md`：Claude Code `statusLine` 数据桥接、快照格式、隐私边界和监控恢复设计。
- `docs/notes/00-学习地图与协作方式.md`：学习阶段、协作流程和推荐开发节奏。
- `docs/notes/04-暴露与事件总线.md`：当前事件总线改造的知识背景。
- `docs/notes/05-Git分支与提交节奏.md`：分支、提交和推送规则。
- `docs/notes/07-Claude-Code状态栏数据桥接.md`：本轮 `statusLine` 数据桥接的实现原理、验证方法和隐私注意事项。

当前进度：已完成 `app.js` 事件总线骨架、`bubble.js` 气泡拆分，以及 `detail:open`、`bubble:say`、`pet:moved` 事件迁移；已将 CC 数据入口从 `detail.js` 迁移到 `app.js`，新增 `cc:update` 事件，形成 `Claude Code statusLine -> claude-statusline-bridge.js -> data/cc-sessions -> cc-monitor -> preload -> app.js -> detail.js` 的单向数据流。

Claude Code 上下文监控已完成以下能力：

- 使用 Claude Code 官方 `statusLine` 标准输入获取当前模型、项目、会话和真实上下文用量，不再使用固定 `200000` 上限推算。
- 每个会话使用独立 UUID 快照；严格校验会话 ID、文件名和路径边界，防止目录穿越。
- 快照只保存界面需要的字段，不保存提示词、回复、transcript 内容或凭据。
- `cc-monitor.js` 支持多会话合并、Windows 路径归一化、异常数据降级、监听器故障恢复，并继续保留旧版累计数据作为兼容来源。
- `detail.js` 能正确显示真实百分比和 `1M` 等窗口上限；数据缺失时显示“上下文数据不可用”。
- 窗口关闭时会停止窗口所属监控器，避免残留监听。

本机 Claude Code 的稳定配置命令为 `node "E:/kaifa/animal/claude-statusline-bridge.js"`。这是用户级外部配置，不属于仓库提交；若仓库移动，需要同步更新 `C:/Users/lenovo/.claude/settings.json`。原配置回滚信息保存在被忽略的 `data/statusline-backup.json`。

下一步优先方向：基于 `cc:update` 做 CC 告警气泡，例如上下文接近阈值时由 `app.js` 判断状态，再通过 `bubble:say` 请求 `bubble.js` 显示提醒。

非阻塞的后续优化：可合并文件监听事件中的重复快照发布；可增加“标准输入格式错误且强制写入失败”的子进程级测试。

## 构建、测试与开发命令

- `npm install`：安装 Electron 和项目依赖。
- `npm start`：通过 Electron 启动桌宠应用。
- `npm run start:node`：用 Node 运行 `main.js`，再自动转交给 Electron。
- `npm run check:electron`：检查当前 Electron 包在 Node 中的解析结果。
- `npm test`：运行现有 5 项 Node 测试，覆盖事件数据流、statusLine 桥接、快照合并、详情上下文渲染和主进程监控生命周期。
- `node --check <file>`：检查 JavaScript 语法，例如 `node --check renderer/js/detail.js`。

当前项目还没有配置 `build` 脚本或正式测试框架，但已通过 `npm test` 串行运行现有 Node 测试脚本。

## 代码风格与命名约定

JavaScript、HTML 和 CSS 统一使用 4 空格缩进。保持模块职责清晰：主进程和文件系统逻辑放在根目录 Node 文件中，界面交互逻辑放在 `renderer/js/` 中。JavaScript 变量和函数使用清晰的 camelCase 命名。

优先使用简单 DOM API，不要在项目计划未变化时引入前端框架。计算逻辑和展示格式要分开：先用原始数字计算，再用 `toLocaleString()` 等方法格式化给界面显示。

HTML 尽量只保留结构，外观交给 CSS，行为交给 JS。桌宠本体应保持“宠物是主角”：不要把说明文字直接贴在宠物身上。

## 测试指南

目前没有正式测试框架。提交或交接改动前，至少运行现有测试、对改过的 JavaScript 文件运行语法检查，并手动验证 Electron 启动：

```bash
npm test
npm start
node --check main.js
```

涉及 UI 或 CC 数据的改动需要验证四个场景：启动后只显示桌宠本体、双击后打开详情面板、详情面板能显示 CC 数据、Claude Code 会话继续输入后上下文百分比能自动更新。还应确认关闭桌宠不会结束 Claude Code，并检查快照中没有提示词、回复、transcript 或凭据字段。

## 提交与 Pull Request 指南

现有提交使用简短中文摘要，可带 emoji，例如 `📖 添加 README`。后续提交应保持简洁，说明本次改动的目的。Pull Request 需要描述用户可见行为、列出主要改动模块；涉及界面变化时应附截图。

推荐 Git 节奏：一个学习主题或功能使用一个清晰分支名，例如 `event-bus`、`settings-panel`、`cc-alerts`；一个可解释的小目标完成并通过基本验证后再提交。提交前检查是否能用一句话说明改动、是否运行过必要的 `node --check`、是否混入不相关文件、是否需要新增或更新 `docs/notes/` 学习笔记。

重要：执行 `git push`、删除远程分支、创建 Pull Request 或任何会更新 GitHub 远程状态的操作前，必须先停下并询问用户确认；未获得明确确认前，只能完成本地检查、暂存或本地提交。

## 架构与学习说明

项目目标不仅是完成应用，也包括理解 Electron、IPC、DOM、CSS、文件监听和数据流。交互采用三层模型：宠物本体、临时对话气泡、详情/设置窗口。

目标架构是事件驱动和单向数据流：`cc-monitor -> app.js -> 各 UI 模块`。模块之间不应直接互相调用；新增功能优先通过 `app.js` 事件总线转发。当前实现仍处于 MVP 过渡阶段，若临时绕过目标结构，应在代码或交接说明中标明原因。

当前已落地的渲染层事件包括：

- `detail:open`：请求打开详情面板，由 `detail.js` 监听并执行打开逻辑。
- `bubble:say`：请求气泡显示一句话，由 `bubble.js` 监听并负责显示、隐藏和计时。
- `pet:moved`：宠物位置发生变化，由 `bubble.js` 监听并重新定位气泡。
- `cc:update`：CC 数据发生变化，由 `app.js` 发出，`detail.js` 监听并刷新详情面板。

模块职责边界按“谁负责 UI，谁操作 DOM”执行：`pet.js` 只负责 `#pet` 的位置、拖拽、走动和宠物交互；`bubble.js` 只负责 `#bubble` 的文字、显示隐藏和定位；`detail.js` 只负责 `#detail-panel` 及其内部渲染；`app.js` 只负责公共事件能力和后续页面级状态，不应塞入具体 UI 渲染细节。

贡献者修改代码时，应解释改动原因、运行机制和相关知识点，而不仅是汇报结果。推荐流程是：说明问题、指出相关文件、解释知识点、改一小步、运行验证、判断是否需要新增学习笔记。

遇到对初学者重要、可复用的知识点时，应在 `docs/notes/` 新增或更新学习笔记，文件名按 `序号-主题.md` 命名，例如 `03-启动调试与数据流问题.md`。学习路线和协作方式详见 `docs/notes/00-学习地图与协作方式.md`。
