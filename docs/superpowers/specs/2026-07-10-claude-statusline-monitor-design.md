# Claude Code statusLine 监控数据设计

> 2026-07-10 · 数据准确性设计

## 一、背景与目标

当前 `cc-monitor.js` 从 `~/.claude/backups/.claude.json.backup.*` 读取聚合数据，`detail.js` 再用 `lastTotalInputTokens / 200000` 模拟上下文使用率。这有两个问题：

- `lastTotalInputTokens` 是会话累计输入量，不是最近一次请求携带的当前上下文。
- 上下文上限被固定为 200K，无法正确处理 `deepseek-v4-flash[1m]` 等 1M 模型。

本机数据验证显示，当前 DeepSeek 会话最近一次输入上下文为 199,573 tokens，而 Claude Code 根据模型名中的 `[1m]` 将窗口上限识别为 1,000,000，因此正确占用率约为 19.96%，不是 100%。

本设计的目标是使用 Claude Code 官方 `statusLine` 输入建立准确、低耦合的上下文数据链路，为 GitHub Issue [#7](https://github.com/WL-tea/animal/issues/7) 的阈值告警提供可靠数据基础。

## 二、范围

本次包含：

- 保留现有 Claude Code 状态栏显示。
- 将 statusLine 输入转换为不含会话正文的最小状态快照。
- 让 `cc-monitor.js` 监听快照，并与现有 backup 聚合数据合并。
- 让详情面板展示真实的上下文上限和占用率。
- 对缺失、损坏或未知版本的数据安全降级。

本次不包含：

- 80%/95% 告警气泡；该功能在数据链路稳定后单独实现 Issue #7。
- 设置面板和自定义阈值。
- Codex 或多 Agent 监控重构；仅在快照中预留来源字段，为 Issue [#3](https://github.com/WL-tea/animal/issues/3) 降低后续迁移成本。
- 在线/离线心跳判断。
- 打包后的桥接脚本安装器。

## 三、方案选择

采用“statusLine 写快照文件，桌宠监听快照”的方案：

```text
DeepSeek API
    -> Claude Code
    -> claude-statusline-bridge.js
       -> 输出原有状态栏文字
       -> 原子写入 data/cc-sessions/<session-id>.json
    -> cc-monitor.js
    -> preload.js
    -> app.js
    -> detail.js
```

未采用本地 HTTP/IPC，因为桌宠未启动时连接会失败，并引入端口与安全问题。未采用 JSONL 作为主要来源，因为 JSONL 会重复记录同一 `message.id`，且模型名可能丢失 `[1m]` 后缀，无法单独可靠确定上下文上限。

## 四、组件职责

### `claude-statusline-bridge.js`

- 从标准输入读取 Claude Code statusLine JSON。
- 使用 Claude Code 已提供的 `context_window.context_window_size`、`used_percentage` 和 `current_usage`，不自行猜测模型容量。
- 输出与当前状态栏相同风格的模型名、十格进度条和百分比。
- 只保存监控需要的字段，不保存提示词、回复正文、认证信息或 transcript 路径。
- 校验 `sessionId` 后，以会话为单位写入快照。
- 采用“临时文件 -> 重命名”的原子写入方式，避免监听器读取到半截 JSON。
- 捕获解析和写入错误；即使快照失败，也应尽可能输出状态栏并以成功状态退出。

### `cc-monitor.js`

- 保留现有 backup 读取，用于累计费用、累计 Token 和模型用量等详情数据。
- 新增 `data/cc-sessions/` 监听，以 statusLine 快照作为上下文数据的唯一可信来源。
- 按规范化后的 `projectPath` 将快照归入项目。
- 同一项目保留多个会话，并选择 `updatedAt` 最大的会话作为详情面板默认会话。
- 忽略损坏文件、未知 `schemaVersion` 和缺少必要标识的快照，保留上一次有效状态。
- 不根据快照更新时间推断会话在线或离线。

### `detail.js`

- 使用监控器提供的上下文字段，不再用累计输入量和固定 200K 计算百分比。
- 百分比计算与展示格式分离；监控器提供原始数值，页面只负责格式化和 DOM 渲染。
- 上下文数据缺失时显示“上下文数据不可用”，不显示虚构的 0% 或 100%。
- 现有项目列表、累计 Token、费用和模型明细继续工作。

## 五、快照格式

每个会话保存一份 JSON：

```json
{
    "schemaVersion": 1,
    "source": "claude-code",
    "sessionId": "8419c2fa-6ccc-4aed-b262-c4488c120a07",
    "projectPath": "E:/kaifa/animal",
    "currentDirectory": "E:/kaifa/animal",
    "model": {
        "id": "deepseek-v4-flash[1m]",
        "displayName": "DeepSeek"
    },
    "context": {
        "windowSize": 1000000,
        "usedPercentage": 19.96,
        "remainingPercentage": 80.04,
        "totalInputTokens": 199573,
        "totalOutputTokens": 23
    },
    "cost": {
        "totalCostUsd": 0,
        "totalDurationMs": 0,
        "totalApiDurationMs": 0
    },
    "updatedAt": 1783660000000
}
```

字段规则：

- `projectPath` 优先使用 `workspace.project_dir`，其次使用 `cwd`。
- `currentDirectory` 优先使用 `workspace.current_dir`，其次使用 `cwd`。
- `context` 在 statusLine 尚未获得第一次 API 响应时允许为 `null`。
- 只有 `context_window_size` 和 `used_percentage` 都是有效数值时才生成非空 `context`；否则安全降级为 `null`。
- `usedPercentage` 和 `remainingPercentage` 使用 Claude Code 的预计算值，不根据模型名重新推导。
- `updatedAt` 由桥接脚本写入快照时生成。

## 六、监控器输出与多会话规则

为保持现有渲染层兼容，项目对象继续保留 `lastCost`、`lastTotalInputTokens`、`lastModelUsage` 等 backup 字段，并新增：

```text
sessions
latestSessionId
contextWindowSize
contextUsedPercentage
contextRemainingPercentage
contextTotalInputTokens
contextTotalOutputTokens
```

其中：

- `sessions` 保存该项目所有有效会话的最小上下文状态。
- `latestSessionId` 指向 `updatedAt` 最大的会话。
- 项目顶层的 `context*` 字段来自最新会话，供现有详情面板直接使用。
- 后续告警不能只判断项目顶层字段，而应逐个会话判断，避免低占用会话掩盖高占用会话。
- 应用启动时可以读取旧快照用于展示，但告警阶段不得因初始加载旧快照立即提醒；提醒只响应启动后的更新或状态跨越。

## 七、Claude Code 配置与回滚

开发阶段将 `~/.claude/settings.json` 中现有的 Python 内联 `statusLine` 命令替换为调用仓库内桥接脚本的 Node 命令。该操作属于用户环境配置，不作为仓库提交内容。

配置变更规则：

- 只替换 `statusLine` 字段，保留其他 Claude Code 设置。
- 修改前仅把原 `statusLine` 对象备份到 Git 忽略的 `data/statusline-backup.json`，不复制认证信息。
- 不在 Electron 启动时静默修改 Claude Code 配置。
- 恢复时只还原备份的 `statusLine` 对象。
- 打包版本以后再把桥接脚本复制到稳定的应用用户数据目录，本次不设计安装器。

## 八、错误处理

- statusLine 输入不是合法 JSON：不写快照，输出简化状态栏。
- 缺少 `session_id` 或项目路径：不写快照，但不影响状态栏。
- 缺少上下文字段：写入 `context: null`，不猜测容量和百分比。
- 快照目录无法创建或文件无法写入：忽略写入失败，状态栏继续工作。
- 监控器读到临时文件或损坏 JSON：忽略该次更新，保留旧状态。
- 快照版本未知：记录提示并忽略。
- 一个会话失败：不影响其他会话或 backup 数据刷新。

## 九、计划文件范围

- 新增 `claude-statusline-bridge.js`。
- 修改 `cc-monitor.js`。
- 修改 `renderer/js/detail.js`。
- 修改 `.gitignore`，忽略 `data/cc-sessions/` 和 statusLine 配置备份。
- 新增桥接脚本与监控器测试。
- 保留 `preload.js`、`app.js` 和 `cc:update` 事件名称，避免在本次混入 Agent 通用化改造。

## 十、验证标准

自动验证至少覆盖：

- 1M DeepSeek 快照保持 1,000,000 上限和正确百分比。
- 200K 模型快照保持 200,000 上限。
- `context_window.current_usage` 或预计算百分比缺失时安全降级。
- 非法会话 ID 不生成文件。
- 损坏 JSON、未知版本和缺失必要字段不会覆盖有效状态。
- 同一项目多个会话时选择最近更新会话作为详情默认值。
- 原有 `cc:update` 数据流测试继续通过。

手动验证：

1. Claude Code 状态栏外观和现有进度条保持正常。
2. `deepseek-v4-flash[1m]` 的 199,573 tokens 显示约 19.96%，不再显示 100%。
3. Claude Code 新消息完成后，详情面板自动刷新。
4. 启动后只显示桌宠本体。
5. 双击宠物可以打开详情面板。
6. 关闭桌宠或制造快照写入失败时，Claude Code 仍能正常使用。
7. 对所有改动过的 JavaScript 文件运行 `node --check`，并运行新增和现有测试。

## 十一、后续步骤

本数据链路稳定后，再单独设计并实现 Issue #7 的阈值状态机：正常、接近上限和危险。告警只在跨越阈值时触发，并通过 `bubble:say` 请求 `bubble.js` 显示，不在 `app.js` 中直接操作气泡 DOM。
