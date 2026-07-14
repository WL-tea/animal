# 用户配置、安全 IPC 与派生状态

## 一、本次任务解决了什么问题

过去 `main.js` 把监控项目写死为应用仓库目录：

```js
windowMonitor.setProjects([__dirname]);
```

这适合开发演示，却不适合真正交给用户使用。用户需要能够：

- 选择自己的项目目录；
- 添加和移除监控项目；
- 重启应用后恢复项目列表；
- 在目录失效时看到明确提示；
- 修改项目列表后立即刷新监控器。

这次实现形成了完整链路：

```text
设置面板
    -> preload 安全 API
    -> Electron IPC
    -> 主进程校验
    -> settings-store 原子保存
    -> CCMonitor 热更新
    -> 渲染层显示最新状态
```

## 二、Electron 为什么要区分三个执行环境

这个项目至少要区分三个概念：

```text
主进程 main.js
preload.js
渲染进程 renderer/*.js
```

### 主进程

主进程拥有较高权限，能够使用：

- Node.js `fs` 和 `path`；
- Electron `dialog`；
- `app.getPath("userData")`；
- `BrowserWindow`；
- 文件监听器和应用生命周期。

它负责真正的系统操作，不负责渲染设置卡片。

### 渲染进程

渲染进程负责 HTML、CSS 和 DOM。它运行的是页面代码，应按不可信页面环境对待。

当前窗口启用了：

```js
contextIsolation: true,
nodeIntegration: false,
```

因此页面不能直接：

```js
require("fs");
require("electron");
```

这不是功能缺失，而是安全边界。页面即使出现脚本注入，也不能立即获得完整本机文件权限。

### preload

`preload.js` 运行在页面加载之前，可以接触 Electron IPC，同时通过 `contextBridge` 把少量受控能力交给页面。

它可以理解为：

```text
主进程能力的白名单门卫
```

它不应把整个 `ipcRenderer`、`fs` 或一个“任意 channel 调用函数”暴露给页面。

## 三、IPC 到底是什么

IPC 是 Inter-Process Communication，即“进程间通信”。

渲染进程和主进程不是同一个 JavaScript 作用域，因此页面不能直接调用 `main.js` 中的函数。它们需要通过消息通道通信。

本项目使用请求/响应形式：

```js
// preload.js：发出请求
ipcRenderer.invoke("settings:get-projects");

// main.js：处理请求并返回结果
ipcMain.handle("settings:get-projects", () => {
    return { ok: true, projects: [] };
});
```

`invoke()` 返回 Promise，所以页面使用：

```js
const result = await window.settingsAPI.getProjects();
```

它看起来像异步函数调用，实际过程是：

```text
渲染进程序列化请求
    -> Electron IPC channel
    -> 主进程执行 handler
    -> 序列化返回值
    -> 渲染进程 Promise 完成
```

这就是为什么 IPC 参数和返回值应使用字符串、数字、布尔值、数组和普通对象，而不是 DOM 节点或带闭包的函数。

## 四、IPC 与事件总线有什么区别

这两个概念很容易混淆。

```text
IPC：跨进程通信
事件总线：同一个渲染页面内部的模块通信
```

例如：

```text
settings.js -> preload.js -> main.js
```

跨越了渲染进程和主进程，需要 IPC。

而：

```text
app.js 发出 cc:update -> detail.js 接收
```

两者都在渲染页面内，只需要 `window.petApp` 事件总线。

判断方法是先问：

```text
这次通信有没有跨过 Electron 进程边界？
```

跨进程使用 IPC；页面内部模块解耦使用事件或直接的 DOM 事件。

## 五、为什么 preload 只暴露三个方法

当前设置 API 是：

```js
contextBridge.exposeInMainWorld("settingsAPI", {
    getProjects: () => ipcRenderer.invoke("settings:get-projects"),
    chooseAndAddProject: () => ipcRenderer.invoke("settings:add-project"),
    removeProject: (projectPath) => ipcRenderer.invoke("settings:remove-project", projectPath),
});
```

页面只能做三件明确的事：

```text
读取监控项目
请求用户选择并添加项目
移除一个监控项目
```

不应这样暴露：

```js
send: (channel, data) => ipcRenderer.invoke(channel, data)
```

因为页面可以自己填写 channel，白名单就失去了意义。

这种设计叫最小权限原则：

```text
只提供完成当前任务所必需的能力。
```

## 六、添加项目的完整数据流

用户点击“添加项目文件夹”后：

```text
settings.js
    -> window.settingsAPI.chooseAndAddProject()
    -> ipcRenderer.invoke("settings:add-project")
    -> ipcMain.handle("settings:add-project")
    -> dialog.showOpenDialog({ openDirectory })
    -> fs.promises.stat() 检查目录
    -> settings-store 规范化并保存
    -> CCMonitor.setProjects()
    -> CCMonitor.refresh()
    -> 返回最新 projects 和 projectStatuses
    -> settings.js 重新渲染
```

目录选择器必须由主进程打开，因为它属于操作系统能力。渲染层只表达用户意图，不直接读取磁盘。

路径检查使用异步 API：

```js
await fs.promises.stat(selectedPath);
```

如果使用 `statSync()` 检查网络盘或慢磁盘，可能阻塞 Electron 主进程，让整个窗口暂时无响应。

## 七、为什么要先保存，再更新监控器

更新项目时采用：

```text
保存 settings.json
    -> 保存成功
    -> 更新 CCMonitor
    -> 立即刷新数据
```

如果先更新内存、后保存磁盘，保存失败时会出现：

```text
本次运行正在监控新项目
但重启后新项目消失
```

因此只有持久化成功后才更新运行状态。保存失败时保留旧监控列表，并向页面返回：

```js
{
    ok: false,
    error: {
        code: "SETTINGS_WRITE_FAILED",
        message: "项目列表保存失败。"
    }
}
```

这体现了数据一致性：内存状态与磁盘事实不能悄悄分叉。

## 八、为什么设置保存在 userData

路径通过以下方式计算：

```js
path.join(app.getPath("userData"), "settings.json");
```

它比仓库内 `data/settings.json` 更适合作为用户配置，因为：

- 打包安装后应用目录可能不可写；
- 仓库移动不应带走或覆盖用户设置；
- 不同系统有各自标准的应用数据目录；
- 配置不应混入 Git 工作区。

文档不写死某台电脑的用户名和绝对用户目录。需要定位时应让 Electron 返回真实路径。

## 九、路径规范化与去重

同一个 Windows 路径可能有不同写法：

```text
E:/kaifa/animal
E:\kaifa\animal
e:\KAIFA\ANIMAL
```

保存前先：

1. 排除非字符串和空字符串；
2. 去掉首尾空白；
3. 使用 `path.resolve()` 转为规范绝对路径；
4. Windows 下用小写比较键去重；
5. 保留第一条规范路径作为展示值。

路径来自 IPC 和配置文件，即使是本机数据，也必须重新校验，不能因为“来自自己的页面”就直接信任。

## 十、原子保存解决什么问题

如果直接覆盖正式配置，程序在写入一半时退出，可能留下：

```json
{"version":1,"projects":["E:\\pro
```

下一次启动就无法解析。

当前保存过程是：

```text
写入同目录临时文件
    -> 写入完整成功
    -> rename 替换正式 settings.json
```

发生错误时清理临时文件并抛出错误。旧正式文件在替换成功前保持完整，这就是原子写入的核心价值。

“原子”不是说磁盘永远不会故障，而是让外部观察者尽量只看到旧完整状态或新完整状态，不看到半截中间状态。

## 十一、持久数据与派生状态

设置文件只保存：

```json
{
  "version": 1,
  "projects": ["E:\\projects\\animal"]
}
```

它不保存 `available`、`missing` 等状态。

原因是：

```text
projects：用户做出的长期选择，是持久数据
status：当前文件系统检查结果，是派生状态
```

一个目录今天可用，明天可能因为移动硬盘断开而不可用。把旧状态写进 JSON 会产生过期事实。

读取设置时重新异步检查并返回：

```js
projectStatuses: [
    { path: "E:\\projects\\animal", status: "available" }
]
```

状态包括：

- `available`：存在、是目录且可读取；
- `missing`：路径不存在；
- `not-directory`：路径存在但不再是目录；
- `unreadable`：权限或其他访问错误。

失效路径不会自动删除，因为移动硬盘和网络盘可能只是暂时离线。用户仍然拥有最终决定权。

## 十二、结构化结果为什么比抛出字符串好

IPC 返回统一结构：

```js
{
    ok: true,
    projects: [],
    projectStatuses: []
}
```

失败时：

```js
{
    ok: false,
    projects: [],
    error: {
        code: "PROJECT_UNAVAILABLE",
        message: "无法访问选择的文件夹。"
    }
}
```

`code` 适合程序判断，`message` 适合当前中文 UI 展示。页面不需要解析异常堆栈，也不会把主进程内部错误细节直接暴露给用户。

## 十三、异步 UI 为什么需要 busy 状态

目录选择、IPC 和磁盘操作都需要时间。如果用户快速连续点击，可能同时打开多个对话框或产生并发保存。

设置模块维护：

```js
const settingsState = {
    projects: [],
    busy: false,
};
```

操作开始时设置 `busy = true` 并禁用按钮，`finally` 中恢复。这可以保证成功、失败和取消三条路径最终都会解除忙碌状态。

UI 还通过 `aria-live="polite"` 状态区域说明：

```text
正在读取项目列表
项目已添加
项目已移除
保存失败
```

用户不需要从按钮颜色猜测程序有没有工作。

## 十四、DOM 为什么使用 textContent

项目路径来自用户选择和本机配置，仍属于外部字符串。目录名完全可能包含：

```text
<img src=x onerror="attack()">
```

设置卡片使用：

```js
const name = document.createElement("strong");
name.textContent = projectName;
```

而不是把路径拼进 `innerHTML`。这样特殊字符只会显示为文字，不会被浏览器解释成标签。

IPC 安全和 HTML 输出安全是两层独立防护：

```text
preload 白名单：限制页面能请求什么系统能力
textContent：限制外部字符串能在页面里变成什么
```

缺少任何一层都不能用另一层代替。

## 十五、这次测试为什么分成多层

本次验证包括：

### 设置存储测试

- 路径规范化和 Windows 大小写去重；
- 首次保存与覆盖保存；
- 损坏 JSON 降级；
- 临时文件清理；
- 原子保存后重新读取。

### 主进程 IPC 测试

- 启动恢复项目；
- 添加、移除和取消；
- 普通文件拒绝；
- `available`、`missing`、`unreadable` 状态；
- 保存后立即刷新监控器。

### preload API 测试

- 页面只得到批准的方法；
- 每个方法使用固定 channel；
- 页面拿不到任意 IPC 调用能力。

### 设置 UI 测试

- 空状态；
- 添加和移除后的重新渲染；
- 失效路径提示；
- 恶意路径只进入 `textContent`。

### Electron 手动验收

- 系统目录选择器；
- 添加后详情立即显示真实数据；
- 重启恢复；
- 移除后重启保持为空；
- 目录改名后显示失效状态；
- 移除监控不会删除真实项目。

每一层回答不同问题。单元测试通过不代表系统目录选择器一定能用；手动看到界面也不能代替损坏 JSON、权限错误和注入字符串的自动断言。

## 十六、本轮学到的通用知识

```text
现象：页面需要选择文件夹，但不能直接 require("fs")。
原因：渲染页面处于低权限环境，系统能力属于主进程。
知识点：通过 preload 白名单和 IPC，把“用户意图”交给主进程执行。
```

```text
现象：修改项目列表后运行时生效，但也必须保证重启后一致。
原因：内存状态和磁盘状态可能在保存失败时分叉。
知识点：先持久化成功，再更新依赖配置的运行状态。
```

```text
现象：保存过的目录后来可能消失。
原因：配置记录的是用户选择，不是文件系统永远不变的事实。
知识点：持久化选择，动态计算状态；临时失效时提示用户，不擅自删除配置。
```

```text
现象：IPC 已经限制权限，页面仍要使用 textContent。
原因：权限边界和 HTML 输出上下文是两个不同的安全问题。
知识点：安全需要分层，每一层只解决自己负责的威胁。
```
