# 仓库工作指南

## 协作规则

### 用户语言与教学方式

- 默认使用中文交流和撰写说明；代码、命令、标识符和专有名词保留原文。
- 项目目标不仅是完成应用，也包括理解 Electron、IPC、DOM、CSS、JavaScript、文件监听和数据流。
- 修改代码时必须解释改动原因、运行机制和相关知识点，不能只汇报结果。

### 修改文件前必须确认

每次修改文件前，必须先向用户说明：

1. 本次要解决什么问题。
2. 为什么需要修改这些文件。
3. 修改后会带来什么效果。
4. 涉及哪些关键知识点。

只有用户明确确认后，才能实际修改文件。推荐按“说明问题 → 指出文件 → 解释知识点 → 用户确认 → 改一小步 → 运行验证 → 讲解具体代码”的顺序协作。

### Superpowers 使用边界

- 默认不使用任何 `superpowers:*` 技能。
- 仅当用户明确要求，或更高优先级指令强制要求时使用。
- 必须使用时，先说明原因，只加载完成当前任务所需的最少技能和辅助文件。
- 常规问答、小型修改和普通验证，不自动串联头脑风暴、规划、调试、测试、审查等技能。

### GitHub 远程操作确认

执行 `git push`、删除远程分支、创建或合并 Pull Request，以及任何会更新 GitHub 远程状态的操作前，必须先停下并询问用户确认。未获得明确确认前，只能完成本地检查、创建本地分支、暂存或本地提交。用户已经针对该次具体操作明确授权时，不必重复询问。

## GitHub Issue 是问题事实来源

GitHub Issue 是项目问题和完成状态的唯一事实来源，不在仓库内维护内容重复的 Issue 清单。当前未关闭问题从 [GitHub Issues](https://github.com/WL-tea/animal/issues?q=is%3Aissue%20state%3Aopen) 查看。

开始处理问题前，应优先读取对应 Issue，确认现象、复现步骤、预期行为、验收条件和最新讨论。若环境无法访问 GitHub，应明确说明并重试或请用户提供 Issue 链接与内容；不得把“读取失败”解释成“当前没有 Bug”。

用户在专门的问题记录对话中提出新的具体问题时，应把完整问题创建为 GitHub Issue。后续进展、关联 PR 和关闭状态均以该 Issue 为准。

## 当前项目状态与续接入口

### 当前基线

- `main` 已通过 PR #10 建立首个可运行开发基线。
- Issue #7 已完成：`app.js` 根据 `cc:update` 判断上下文阈值，并通过 `bubble:say` 请求提醒。
- Issue #11 已完成：CC 备份读取、文件监听恢复和不可信快照降级处理得到加固。
- Issue #12 已完成：详情面板中的外部字符串经过 HTML 转义，避免被解释为标签或脚本。
- Issue #6 已通过 PR #15 完成：用户可以添加、移除并持久化监控项目，设置通过安全 IPC 链路更新 `CCMonitor`。
- Issue #14 已通过 PR #26 完成：宠物与详情拆分为独立 `BrowserWindow`，详情使用普通窗口层级，桌宠置顶可以即时切换并持久化。
- 当前渲染层已经具备宠物页面与详情页面分离、`app.js` 页面级事件总线，以及 `pet.js`、`bubble.js`、`detail.js`、`settings.js` 的职责拆分。
- 当前设置结构为 `{ version: 2, projects: [], petAlwaysOnTop: true }`，旧版本配置读取时会安全迁移。
- 当前设置链路为：`settings.js -> preload.js 固定 API -> main.js -> settings-store.js -> Electron userData/settings.json -> CCMonitor / petWindow`。
- 当前 CC 数据流为：`Claude Code statusLine -> claude-statusline-bridge.js -> data/cc-sessions -> cc-monitor.js -> main.js 广播目标 -> 宠物窗口 / 详情窗口`。

以上只是便于续接的基线快照。开始新工作时仍要读取 GitHub 的未关闭 Issue，避免把本文件中的阶段性描述当成实时看板。

### 下一步建议

Issue #14 已完成收尾，当前本地位于与 `origin/main` 同步的 `main`，没有遗留功能分支。开始下一项工作前，应先读取 GitHub 未关闭 Issue 的最新状态和优先级，再从最新 `main` 创建独立短分支。

下一项建议优先处理 Issue #20 系统托盘和应用显示、隐藏、找回与退出控制。当前监控器生命周期仍由宠物窗口拥有；加入托盘后，应把应用常驻和监控器所有权上移到 `app` / `Tray` 生命周期，明确区分“隐藏宠物”“关闭详情”和“退出应用”。之后再衔接 Issue #1 跨多显示器拖动桌宠与 Issue #5 透明空白区域点击穿透。

非阻塞优化包括：合并文件监听事件中的重复快照发布；增加“标准输入格式错误且强制写入失败”的子进程级测试。

### 已完成任务记录：Issue #14

任务名：**独立详情窗口与桌宠置顶策略**。

交付状态：提交 `bba7efc`、`1e1c32b` 已通过 PR #26 合并到 `main`；Issue #14 由 `Closes #14` 自动关闭，本地和远程功能分支均已删除。

具体工作：

- 将原来同一页面内的宠物、气泡和详情面板拆分为宠物窗口与独立详情窗口；
- 宠物窗口保持透明、无边框和可配置置顶，详情窗口使用普通窗口层级并支持调整大小；
- 重复双击宠物时复用并唤回已有详情窗口，不重复创建实例；
- 关闭详情窗口不关闭宠物、不停止 Claude Code 监控；关闭宠物时关闭详情并停止监控器；
- 使用一个 `CCMonitor` 和主进程广播目标向宠物窗口与详情窗口发送同一份 `cc-update`；
- 新增 `window.windowAPI.openDetail()`、`closeDetail()` 与置顶设置固定 API，不向渲染页面暴露任意 IPC channel；
- 设置结构升级为版本 2，新增 `petAlwaysOnTop`，旧配置缺少字段时保持原有默认置顶行为；
- 项目增删采用“读取—合并—原子保存”，避免覆盖置顶等其他设置字段；
- 详情标题栏使用 `app-region: drag`，关闭按钮等控件使用 `no-drag` 保持可点击；
- 详情窗口完全离开所有显示器可见区域、显示器断开或参数变化时恢复到主显示器；
- 新增独立详情页面、窗口行为设置 UI，并扩展主进程生命周期、preload API、设置存储和设置 UI 测试；
- 新增 `docs/notes/13-多窗口职责与独立置顶.md`，记录多窗口、IPC、设置迁移和生命周期设计。

完成时执行的验证：

- 18 个项目 JavaScript 文件通过 `node --check`；
- `npm test` 的 8 组测试全部通过；
- `git diff --check` 通过；
- Electron 手动验收通过独立详情窗口、重复打开复用、关闭详情不退出宠物、置顶开关即时生效和重启恢复；
- 人工验收通过标题栏拖动、交互控件点击和双显示器拖动与窗口找回；
- 测试进程已经清理，用户设置恢复为 `{ version: 2, projects: [], petAlwaysOnTop: true }`。

收尾结果：PR #26 已合并，Issue #14 已关闭；合并后再次运行自动测试和语法检查，本地 `main` 已同步，工作区干净。

### 已完成任务记录：Issue #6

任务名：**持久化监控项目路径与安全 IPC 设置链路**。

交付状态：提交 `384fe79` 已通过 PR #15 合并到 `main`，合并提交为 `291d794`；Issue #6 已关闭，本地和远程功能分支均已删除。

具体工作：

- 新增 `settings-store.js`，以 `{ version: 1, projects: [] }` 保存设置；
- 使用 `app.getPath("userData")/settings.json`，不再把用户配置写进仓库；
- 路径保存前执行去空白、绝对路径规范化和 Windows 大小写去重；
- 使用“同目录临时文件 + rename”原子写入，损坏 JSON 安全回退为空配置；
- `main.js` 启动时恢复项目列表，不再默认监控 `__dirname`；
- 增加 `settings:get-projects`、`settings:add-project`、`settings:remove-project` 三个 IPC handler；
- `preload.js` 只暴露 `getProjects`、`chooseAndAddProject`、`removeProject` 三个固定方法；
- 添加前由主进程打开系统目录选择器，并异步检查目录类型和可访问性；
- 保存成功后调用 `CCMonitor.setProjects()` 和 `refresh()`，无需重启即可更新监控；
- 已保存路径重新读取时计算 `available`、`missing`、`not-directory`、`unreadable` 派生状态；
- 新增设置覆盖面板、首次使用空状态、项目卡片、移除按钮和失效路径提示；
- 外部路径统一通过 `textContent` 渲染，不拼入 `innerHTML`；
- 新增设置存储、preload API 和设置 UI 测试，并扩展主进程生命周期测试；
- 新增 `docs/notes/12-用户配置、安全IPC与派生状态.md`，记录 IPC、原子保存和配置状态设计。

完成时执行的验证：

- 18 个项目 JavaScript 文件通过 `node --check`；
- `npm test` 的 8 组测试全部通过；
- `git diff --check` 通过；
- Electron 手动验收通过添加、立即刷新、重启恢复、移除、移除后重启和失效路径提示；
- 手动验证“移除监控”不会删除真实项目目录；
- 临时测试目录和测试进程已经清理，用户设置恢复为 `{ version: 1, projects: [] }`。

收尾结果：PR #15 已合并，Issue #6 已由 `Closes #6` 自动关闭；合并后再次运行 8 组测试和 18 个 JavaScript 文件语法检查，结果全部通过。本地 `main` 已同步，工作区干净。

### 继续开发前优先阅读

- `README.md`：运行方式、当前功能和用户配置入口。
- `docs/superpowers/specs/2026-07-01-desktop-pet-design.md`：产品定位、MVP/V2/V3 路线和模块通信原则。
- `docs/superpowers/specs/2026-07-10-claude-statusline-monitor-design.md`：statusLine 数据桥接、隐私边界和监控恢复设计。
- `docs/notes/00-学习地图与协作方式.md`：学习阶段和协作节奏。
- `docs/notes/04-暴露与事件总线.md`、`06-CC数据入口与单向数据流.md`：事件总线和单向数据流。
- `docs/notes/05-Git分支与提交节奏.md`、`09-分层测试与GitHub验收.md`：分支、PR、测试和验收工作流。
- `docs/notes/07-Claude-Code状态栏数据桥接.md`、`08-上下文阈值与状态跨越.md`：CC 数据桥接与告警判断。
- `docs/notes/10-文件监听故障与不可信数据.md`、`11-innerHTML与外部字符串.md`：监听恢复、输入边界和安全渲染。
- `docs/notes/12-用户配置、安全IPC与派生状态.md`：Electron 进程边界、preload 白名单、IPC、原子配置保存和项目路径状态。
- `docs/notes/13-多窗口职责与独立置顶.md`：独立 `BrowserWindow`、跨窗口 IPC、共享监控广播、配置迁移和窗口生命周期。

遇到对初学者重要且可复用的新知识时，应新增或更新 `docs/notes/` 学习笔记，文件名按 `序号-主题.md` 命名。

## Git 分支、PR 与合并流程

### `main` 的职责

`main` 表示当前稳定、可运行、可继续开发的基线。项目初始化时，可以先在 `main` 放入最小可识别骨架，例如 README、`.gitignore`、许可证和基础目录；一旦准备开始可独立描述的功能或问题，就从 `main` 创建分支，不在 `main` 上持续堆叠功能开发。

### 推荐节奏

1. 同步并确认本地 `main` 干净、可运行。
2. 一个 Issue 或一个清晰学习主题创建一个短分支，例如 `cc-alerts`、`fix/watcher-recovery`、`docs/update-agent-guide`。
3. 完成一个可解释的小目标并通过对应验证后提交；不要混入无关文件。
4. 第一批有意义的提交推送后，可以创建 Draft PR，让目标、范围和进度尽早可见。
5. 功能、自动测试、手动验收和文档说明完成后，再把 PR 转为 Ready for review。
6. 审查和 CI 通过、Issue 验收条件满足后，才计划合并到 `main`。合并目标是把一个已完成且可独立验证的增量纳入稳定基线，不要求等到整个 MVP 完成。
7. 合并后同步本地 `main`；确认分支不再需要后删除本地和远程功能分支。删除分支不会删除已经合并的提交历史。

PR 应描述用户可见行为、主要改动模块、验证结果和关联 Issue；涉及界面变化时附截图。提交摘要保持简洁，说明改动目的，可使用简短中文和 emoji。

## 项目结构与模块职责

本仓库是基于 Electron 的功能型桌面宠物，渲染层使用原生 HTML、CSS 和 JavaScript。

- `main.js`：Electron 主进程，创建宠物窗口与详情窗口，广播 CC 更新并管理窗口和监控器生命周期。
- `preload.js`：安全 IPC 桥接层，向渲染进程暴露受控的 `window.ccAPI`、`window.settingsAPI` 和 `window.windowAPI`。
- `settings-store.js`：读取、迁移、规范化并原子保存 Electron 用户设置。
- `claude-statusline-bridge.js`：Claude Code `statusLine` 命令入口，读取标准输入，并把隐私白名单允许的会话快照原子写入 `data/cc-sessions/`。
- `cc-monitor.js`：读取和合并 CC 数据，处理 Windows 路径、异常快照、备份来源和监听器恢复。
- `renderer/index.html`：宠物窗口的页面结构入口，只加载宠物、气泡和对应脚本。
- `renderer/detail-window.html`：独立详情窗口的页面结构入口，承载项目详情和设置面板。
- `renderer/css/`：宠物、气泡、详情面板和设置面板的外观。
- `renderer/js/app.js`：公共事件能力、CC 页面级状态和告警判断，不负责具体 UI DOM 渲染。
- `renderer/js/pet.js`：只负责 `#pet` 的位置、拖拽、走动和宠物交互。
- `renderer/js/bubble.js`：只负责 `#bubble` 的文字、显示隐藏、计时和定位。
- `renderer/js/detail.js`：只负责 `#detail-panel` 及其内部数据渲染。
- `renderer/js/settings.js`：只负责 `#settings-panel`、项目配置异步状态和设置 DOM。
- `docs/notes/`：可复用的学习笔记。
- `docs/superpowers/specs/`：产品和架构设计文档；目录名是历史命名，不代表日常任务必须调用 Superpowers 技能。

仓库桥接脚本生成的 CC 运行时快照放在 `data/` 下并保持 Git 忽略。Electron 用户设置保存在 `app.getPath("userData")` 指向的应用数据目录，不属于仓库文件。除非用户明确要求，不得把任何本机运行时数据提交到 Git。

## 架构原则

交互采用三层模型：宠物本体、临时对话气泡、详情/设置面板。宠物本体保持“宠物是主角”，不要直接把说明文字贴在宠物身上。

模块采用事件驱动和单向数据流。模块之间不直接调用对方的 UI 函数，优先通过 `app.js` 事件总线通信。当前主要事件包括：

- `detail:open`：请求打开详情面板，由 `detail.js` 执行。
- `bubble:say`：请求显示一句气泡文本，由 `bubble.js` 执行。
- `pet:moved`：通知宠物位置改变，由 `bubble.js` 重新定位。
- `cc:update`：发布新的 CC 数据，由详情渲染和告警状态逻辑消费。

遵循“谁负责 UI，谁操作对应 DOM”。HTML 尽量只保留结构，CSS 负责外观，JavaScript 负责行为。计算逻辑和展示格式分开：先使用原始数字计算，再用 `toLocaleString()` 等方法生成展示文本。

所有来自文件、IPC、用户配置或外部工具的字符串都视为不可信数据。优先使用 `textContent`；必须生成 HTML 时先按输出上下文转义。文件监听器、窗口和定时器必须有明确的所有者，并在生命周期结束时释放。

## Claude Code 数据与本机配置边界

- 快照只保存界面需要的白名单字段，不保存提示词、回复、transcript 内容或凭据。
- 每个会话使用独立 UUID 快照，并校验会话 ID、文件名和目标路径，防止目录穿越。
- 数据缺失或损坏时应降级为“上下文数据不可用”，不能让单个坏文件中断全部监控。
- 窗口关闭时只停止窗口所属监控器，不得结束 Claude Code 会话。

Claude Code 的 `statusLine` 设置属于用户级外部配置，不属于仓库提交，也不是项目状态的事实来源。本机当前命令为 `node "E:/kaifa/animal/claude-statusline-bridge.js"`；仓库移动后需要同步更新用户设置。回滚信息保存在被忽略的 `data/statusline-backup.json`。不要把用户名、凭据或其他机器私有配置写进仓库文档。

## 构建、测试与验证

- `npm install`：安装 Electron 和项目依赖。
- `npm start`：通过 Electron 启动应用。
- `npm run start:node`：用 Node 运行 `main.js`，再转交给 Electron。
- `npm run check:electron`：检查 Electron 包在普通 Node 环境中的解析结果。
- `npm test`：串行运行当前 8 个 Node 测试脚本。
- `node --check <file>`：检查单个 JavaScript 文件语法。

项目当前没有 `build` 脚本，不要运行或在文档中宣称存在 `npm run build`。

验证强度按改动风险选择：

- 纯文档改动：至少运行 `git diff --check`，复核链接、命令和 Git 状态。
- JavaScript 改动：运行相关文件的 `node --check` 和 `npm test`。
- Electron 生命周期、UI 或 CC 数据改动：除自动测试外，运行 `npm start` 并进行对应手动验收。

UI 与 CC 数据的基础手动场景包括：启动后只显示桌宠本体；双击后打开详情面板；详情能显示 CC 数据；会话继续输入后百分比自动更新；跨越告警阈值时气泡只按设计提醒；关闭桌宠不结束 Claude Code。

安全相关改动还应检查：快照不含提示词、回复、transcript 或凭据；外部字符串不会被解释成 HTML；坏快照和监听故障不会阻塞其他有效数据源。

提交或交接前，应说明实际运行了哪些验证及其结果；没有运行的测试必须明确标注，不能用推测代替结果。
