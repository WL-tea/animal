# Animal - 功能型桌面宠物

## 项目概述

基于 Electron 的桌面宠物，悬浮置顶，能走动互动，实时显示 Claude Code 运行状态。详见 `docs/superpowers/specs/2026-07-01-desktop-pet-design.md`。

## 技术栈

- Electron（透明窗口 + 置顶）
- 纯 HTML/CSS/JS（渲染进程）
- 无前端框架，轻量单页架构

## 核心设计原则

1. **宠物是主角**：信息通过宠物表达，不贴文字在宠物身上
2. **三层交互**：宠物本体（无文字）→ 对话气泡（简短）→ 详情窗口（完整）
3. **事件驱动**：模块通过 `app.js` 事件总线通信，不互相直接调用
4. **数据单向流动**：cc-monitor → app.js → UI 模块

## 项目结构

```
animal/
├── main.js           # Electron 主进程
├── preload.js        # IPC 桥接
├── renderer/
│   ├── index.html
│   ├── css/          # pet / bubble / detail / settings
│   ├── js/           # app / pet / pet-states / bubble / detail / settings / cc-monitor
│   └── assets/
├── data/             # 运行时 JSON
├── docs/
└── package.json
```

## 版本路线

- **MVP**：透明窗 + 置顶 + CSS 几何宠物 + 走动 + 拖拽 + 气泡 + 详情窗口 + CC 监控
- **V2**：换肤 + 完整状态机 + 提醒功能 + 插件机制
- **V3**：AI 对话

## 开发命令

- 启动：`npm start`
- 打包：`npm run build`
