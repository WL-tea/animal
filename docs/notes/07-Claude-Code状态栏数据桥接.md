# Claude Code 状态栏数据桥接

## 一、看到的现象

backup 中的 `lastTotalInputTokens` 是累计数据。把它除以固定的 200K 会让 1M DeepSeek 会话错误显示为 100%。

## 二、三个数据来源的区别

- backup：适合累计费用、累计 Token 和模型用量。
- JSONL：包含每次 API 响应的 usage，但有重复消息，模型名也可能丢失 `[1m]`。
- statusLine：由 Claude Code 提供当前上下文、窗口上限和预计算百分比，适合实时上下文监控。

## 三、桥接脚本为什么写快照

statusLine 命令只在 Claude Code 进程中接收 JSON。桥接脚本一边输出原有状态栏，一边把最小状态写入 `data/cc-sessions/`，让 Electron 可以通过文件监听获得数据。文件方式不要求桌宠始终运行，也不需要开放本地端口。

## 四、原子写入

先写临时文件，再重命名为正式 JSON，可以避免监听器在写入进行到一半时读取到不完整内容。

## 五、安全降级

无法确定上下文上限或占用率时，应显示“数据不可用”，而不是猜测一个数值。监控功能可以失败，但不能影响 Claude Code 本身。
