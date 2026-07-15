# Animal - 功能型桌面宠物

> 这是一个 AI 工具初学者第一次尝试用 AI 独立完成的项目。

---

## 关于这个项目

我是个编程爱好者，会一点 HTML/CSS 和 Python，JavaScript 只会基础。这是我**第一次尝试完全借助 AI（Claude Code）** 从零开始设计、规划并开发一个完整的桌面应用。

整个项目的设计文档、代码、架构，都是在 AI 的引导下一步步完成的。过程中我学到了很多——从 Electron 基础到 JavaScript 事件驱动，从文件监听到状态机设计。

## 项目定位

一个**功能型桌面宠物**，悬浮在桌面上，能走动互动，实时显示 Claude Code 的运行状态。

- 🐾 **宠物是主角** — 信息通过宠物的"表达"来传递，不贴文字在宠物身上
- 💬 **三层交互** — 宠物本体 → 对话气泡 → 详情窗口
- ⚡ **CC 监控** — 实时追踪 Claude Code 的 token、上下文、Agent 使用情况
- 🔧 **可扩展** — 预留插件机制，V2 后支持换肤、提醒、AI 对话

## 技术栈

- **Electron** — 透明窗口 + 永远置顶
- **HTML + CSS + JS** — 纯前端渲染，无框架
- **Node.js** — 文件监听与数据读取

## 安装与启动

先安装依赖：

```bash
npm install
```

启动桌宠：

```bash
npm start
```

如果误用了 `node main.js`，项目也会自动转交给 Electron 启动。

注意：在普通 Node.js 环境里执行 `require("electron")` 时，得到的是 Electron 可执行文件路径，这是正常现象；只有通过 `electron .` 启动应用时，主进程里才会拿到 `app`、`BrowserWindow` 等 Electron API。可以用下面的命令检查：

```bash
npm run check:electron
```

## 测试

运行现有 Node 测试：

```bash
npm test
```

测试覆盖事件数据流、Claude Code statusLine 桥接、会话快照合并、详情上下文渲染、主进程监控生命周期、设置存储、安全 preload API 和设置界面交互。

修改 JavaScript 后还可以单独进行语法检查：

```bash
node --check renderer/js/app.js
```

## Claude Code 上下文监控

桌宠使用 Claude Code 官方 `statusLine` 输入获取当前模型、项目、会话和真实上下文使用率。

在 Claude Code 用户级 `settings.json` 中，把 `statusLine.command` 配置为调用仓库内桥接脚本。请把示例路径替换为本机仓库的实际绝对路径：

```json
{
    "statusLine": {
        "type": "command",
        "command": "node \"E:/path/to/animal/claude-statusline-bridge.js\""
    }
}
```

Windows 路径推荐使用正斜杠 `/`，或者在 JSON 中把反斜杠写成 `\\`。仓库移动后，需要同步更新这个用户级配置。

数据链路如下：

```text
Claude Code statusLine
    -> claude-statusline-bridge.js
    -> data/cc-sessions/<session-id>.json
    -> cc-monitor.js
    -> preload.js
    -> app.js
    -> detail.js / bubble.js
```

### 管理监控项目

双击桌宠打开独立详情窗口，再点击左下角的“设置”，可以添加或移除要监控的 Claude Code 项目目录。

详情现在使用独立窗口：双击桌宠时窗口会显示到前方；关闭详情只关闭界面，不会关闭桌宠或停止监控。详情顶部标题栏可以拖动，切换到其他应用后也不会像桌宠一样永久置顶。

- “添加项目文件夹”会打开系统目录选择器；
- 路径保存前会转换为规范的绝对路径并去重；
- 项目列表保存在 Electron 的本机用户数据目录，不写入仓库；
- 添加或移除后，监控器会立即使用新列表刷新，不需要重启应用；
- 应用重启时会自动恢复上次保存的项目；
- “移除”只停止监控，不会删除项目目录或其中的文件；
- 如果已保存目录后来被移动、删除或变得不可读，设置面板会显示具体状态，由用户决定是否移除。
- 设置中的“桌宠始终置顶”修改后立即生效，并会在应用重启后恢复；该选项只影响宠物窗口，不影响详情窗口的正常前后台层级。

设置数据流如下：

```text
settings.js
    -> window.settingsAPI
    -> preload.js
    -> ipcRenderer.invoke(...)
    -> ipcMain.handle(...)
    -> settings-store.js
    -> Electron userData/settings.json
    -> CCMonitor.setProjects() / refresh()
```

页面不能直接访问 Node.js `fs`、Electron `dialog` 或任意 IPC channel。`preload.js` 只向页面暴露读取项目、选择并添加项目、移除项目三个受控方法。

上下文达到 80% 时，桌宠会显示接近上限提醒；达到 95% 时显示危险提醒。同一区间连续更新不会重复提醒，使用率下降后再次越过阈值可以重新提醒。

### 隐私边界

状态快照只保存界面所需的白名单字段，例如项目路径、会话 ID、模型、上下文窗口和数值用量。快照不会保存：

- 提示词和回复正文；
- transcript 内容或路径；
- API Key、Token 或其他凭据。

运行时快照保存在 `data/` 下并由 Git 忽略。无法确定上下文窗口或百分比时，界面会显示数据不可用，不会猜测固定的 200K 或 1M 上限。

监控项目配置同样只保存在本机，但项目路径本身仍属于本机信息，不应复制进仓库文档、Issue 或公开日志。

## 当前状态

当前版本已经具备：

- CSS 几何桌宠、自动走动和拖拽；
- 临时对话气泡与详情面板；
- `app.js` 事件总线和单向数据流；
- Claude Code statusLine 会话快照监控；
- 真实上下文窗口、百分比、Token 和费用展示；
- 80%/95% 上下文阈值告警；
- 多会话合并、异常数据降级和文件监听恢复；
- 通过设置面板添加、移除并持久化监控项目；
- 监控路径失效提示、安全 IPC 白名单和原子配置保存。
- 独立、可拖动的详情窗口，以及与详情互不干扰的桌宠置顶设置。

## 版本路线

| 阶段 | 功能 |
|------|------|
| MVP | 透明窗口 + 几何宠物 + 走动 + 拖拽 + 气泡 + CC 监控 |
| V2 | 换肤 + 状态机 + 提醒 + 插件机制 |
| V3 | AI 对话 |

## 致谢

本项目由 [Claude Code](https://claude.ai) 辅助完成。感谢 AI 让我这样的初学者也能把想法变成真实的软件。
