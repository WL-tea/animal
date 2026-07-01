const electron = require("electron");
const path = require("path");

// 用普通 Node 运行时，electron 包只会返回可执行文件路径。
// 这里自动转交给 Electron，避免初学阶段遇到 app 是 undefined。
if (typeof electron === "string") {
    // 防止无限递归：如果已经在 Electron 环境（即便 require 坏了），不再 spawn
    if (process.versions && process.versions.electron) {
        console.error("错误：当前环境的 Electron API 不可用。");
        console.error("提示：这是 Electron 在 Windows 上的已知兼容问题。");
        process.exit(1);
    }

    const { spawn } = require("child_process");
    const child = spawn(electron, [__dirname], {
        cwd: __dirname,
        stdio: "inherit",
        windowsHide: false,
    });

    child.on("close", (code) => process.exit(code ?? 0));
    return;
}

const { app, BrowserWindow, ipcMain } = electron;
const CCMonitor = require("./cc-monitor");

let ccMonitor = null;

function createWindow() {
    // 创建一个透明、无边框、置顶的窗口
    const win = new BrowserWindow({
        width: 400,
        height: 600,
        transparent: true,      // 背景透明
        frame: false,           // 无边框
        alwaysOnTop: true,      // 永远置顶
        resizable: false,       // 禁止用户调整大小
        hasShadow: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // 加载宠物页面
    win.loadFile(path.join(__dirname, "renderer", "index.html"));

    // 启动 CC 监控（连接到这个窗口）
    ccMonitor = new CCMonitor(win.webContents);
    ccMonitor.setProjects([
        __dirname,  // 默认监控当前项目
    ]);
    ccMonitor.refresh();
}

// 页面请求刷新数据时响应
ipcMain.handle("cc-refresh", () => {
    if (ccMonitor) ccMonitor.refresh();
});

// app.whenReady() 等 Electron 准备好后才创建窗口
app.whenReady().then(() => {
    createWindow();
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
