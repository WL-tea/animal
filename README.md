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

测试覆盖事件数据流、Claude Code statusLine 桥接、会话快照合并、详情上下文渲染和主进程监控生命周期。

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

上下文达到 80% 时，桌宠会显示接近上限提醒；达到 95% 时显示危险提醒。同一区间连续更新不会重复提醒，使用率下降后再次越过阈值可以重新提醒。

### 隐私边界

状态快照只保存界面所需的白名单字段，例如项目路径、会话 ID、模型、上下文窗口和数值用量。快照不会保存：

- 提示词和回复正文；
- transcript 内容或路径；
- API Key、Token 或其他凭据。

运行时快照保存在 `data/` 下并由 Git 忽略。无法确定上下文窗口或百分比时，界面会显示数据不可用，不会猜测固定的 200K 或 1M 上限。

## 当前状态

当前版本已经具备：

- CSS 几何桌宠、自动走动和拖拽；
- 临时对话气泡与详情面板；
- `app.js` 事件总线和单向数据流；
- Claude Code statusLine 会话快照监控；
- 真实上下文窗口、百分比、Token 和费用展示；
- 80%/95% 上下文阈值告警；
- 多会话合并、异常数据降级和文件监听恢复。

## 版本路线

| 阶段 | 功能 |
|------|------|
| MVP | 透明窗口 + 几何宠物 + 走动 + 拖拽 + 气泡 + CC 监控 |
| V2 | 换肤 + 状态机 + 提醒 + 插件机制 |
| V3 | AI 对话 |

## 致谢

本项目由 [Claude Code](https://claude.ai) 辅助完成。感谢 AI 让我这样的初学者也能把想法变成真实的软件。
