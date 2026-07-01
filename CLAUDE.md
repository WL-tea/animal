# Animal - 功能型桌面宠物

## 项目概述

基于 Electron 的桌面宠物，悬浮置顶，能走动互动，实时显示 Claude Code 运行状态。详见 `docs/superpowers/specs/2026-07-01-desktop-pet-design.md`。

**项目性质**：AI 初学者第一次尝试用 AI 独立完成的项目。学习为主，代码为辅。

## 技术栈

- Electron（透明窗口 + 置顶）— 当前遇到安装兼容问题
- 纯 HTML/CSS/JS（渲染进程）— 在浏览器中也可开发调试
- 无前端框架，轻量单页架构

## 核心设计原则

1. **宠物是主角**：信息通过宠物表达，不贴文字在宠物身上
2. **三层交互**：宠物本体（无文字）→ 对话气泡（简短）→ 详情窗口（完整）
3. **事件驱动**：模块通过 `app.js` 事件总线通信，不互相直接调用
4. **数据单向流动**：cc-monitor → app.js → UI 模块
5. **外观与行为分离**：宠物 HTML 只留容器，CSS 伪元素绘制外观。V2 换肤用图片序列帧导入

## 项目结构

```
animal/
├── main.js           # Electron 主进程（透明窗口 + 置顶 + 托盘 + CC 监控启动）
├── cc-monitor.js     # CC 数据监听模块（主进程，读取 .claude 目录）
├── preload.js        # IPC 桥接（安全暴露 ccAPI 给页面）
├── renderer/
│   ├── index.html    # 宠物页面入口（只有 #pet 容器 + 详情窗口）
│   ├── css/
│   │   ├── pet.css   # 宠物外观（伪元素画眼睛）+ 气泡样式 + 走动动画
│   │   ├── detail.css（已实现：详情窗口侧栏 + 主区域）
│   │   └── settings.css（待实现）
│   ├── js/
│   │   ├── pet.js（已实现：走动/拖拽/气泡）
│   │   ├── detail.js（已实现：CC 数据展示、项目列表切换）
│   │   ├── cc-monitor.js（不在此处——在主进程 root 目录）
│   │   ├── app.js（待实现：主控 + 事件总线）
│   │   ├── settings.js（待实现）
│   │   └── pet-states.js（待实现：V2 状态机）
│   └── assets/
├── data/             # 运行时 JSON
├── docs/
│   ├── notes/        # 学习笔记（知识点记录）
│   └── superpowers/specs/  # 设计文档
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

## 设计决策日志

### MVP 阶段
- HTML 只保留一个 `#pet` 容器，外观由 CSS 伪元素（`::before`/`::after`）绘制
- 换肤机制 V2 再实现：用户导入图片序列帧包 + JSON 配置文件，程序限帧循环播放
- 学习路线：先浏览器开发 HTML/CSS/JS 逻辑，Electron 只做最后包装
- 双向通信流程：cc-monitor（主进程）→ IPC（preload.js）→ detail.js（页面）

### 当前已知问题
- Electron 在 Windows 上：`require("electron")` 返回 npm 包路径字符串而非真实 API
- 影响版本：v30 ~ v33+，此为 Electron 官方的 Windows 平台 bug（Issue #49034）
- 临时方案：宠物逻辑可在浏览器中开发调试，Electron 包装待问题修复或换方案

### 已修正的错误认知

~~Electron 在 Windows 上有兼容性 bug，require 永远拿不到 API。~~

实际：`require("electron")` 在普通 Node.js 里返回路径字符串是 npm 包的正常设计。API 只在 `electron .` / `npm start` 启动时才可用。之前的测试用了 `node -e` 和 `npx electron -e`，那些命令绕过了 Electron 的运行时初始化。

修复：`main.js` 加了 `typeof electron === "string"` 判断，自动 spawn Electron，防止误用 `node main.js`。

## 版本路线

- **MVP**：透明窗 + 置顶 + CSS 几何宠物 + 走动 + 拖拽 + 气泡 + 详情窗口 + CC 监控
- **V2**：图片序列帧换肤 + 完整状态机（睡觉/警觉）+ 提醒功能 + 插件机制
- **V3**：AI 对话（随机对话 + 节假日特殊对话）

## 开发命令

- 启动：`npm start`
- 打包：`npm run build`
- 当前 `require("electron")` 存在 Windows 兼容问题，开发中