const electron = require("electron");
const fs = require("fs");
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

const { app, BrowserWindow, dialog, ipcMain } = electron;
const CCMonitor = require("./cc-monitor");
const {
    loadSettings,
    normalizeProjectPaths,
    saveSettings,
} = require("./settings-store");

let ccMonitor = null;

function getSettingsPath() {
    return path.join(app.getPath("userData"), "settings.json");
}

function projectPathKey(projectPath) {
    return process.platform === "win32" ? projectPath.toLowerCase() : projectPath;
}

function updateMonitoredProjects(projects) {
    const settings = saveSettings(getSettingsPath(), { projects });

    if (ccMonitor) {
        ccMonitor.setProjects(settings.projects);
        ccMonitor.refresh();
    }

    return settings.projects;
}

async function inspectProjectPaths(projects) {
    return Promise.all(projects.map(async (projectPath) => {
        try {
            const stats = await fs.promises.stat(projectPath);
            if (!stats.isDirectory()) {
                return { path: projectPath, status: "not-directory" };
            }

            await fs.promises.access(projectPath, fs.constants.R_OK);
            return { path: projectPath, status: "available" };
        } catch (error) {
            return {
                path: projectPath,
                status: error.code === "ENOENT" ? "missing" : "unreadable",
            };
        }
    }));
}

async function projectResult(result) {
    return {
        ...result,
        projectStatuses: await inspectProjectPaths(result.projects),
    };
}

function projectError(code, message, projects) {
    return projectResult({
        ok: false,
        projects,
        error: { code, message },
    });
}

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

    // 用户配置保存在 Electron 的 userData 目录，不依赖仓库所在位置。
    const settings = loadSettings(getSettingsPath());

    // 启动 CC 监控（连接到这个窗口）
    const windowMonitor = new CCMonitor(win.webContents);
    ccMonitor = windowMonitor;
    windowMonitor.setProjects(settings.projects);
    windowMonitor.refresh();

    win.on("closed", () => {
        windowMonitor.stopWatching();
        if (ccMonitor === windowMonitor) {
            ccMonitor = null;
        }
    });
}

// 页面请求刷新数据时响应
ipcMain.handle("cc-refresh", () => {
    if (ccMonitor) ccMonitor.refresh();
});

ipcMain.handle("settings:get-projects", () => projectResult({
    ok: true,
    projects: loadSettings(getSettingsPath()).projects,
}));

ipcMain.handle("settings:add-project", async () => {
    const currentProjects = loadSettings(getSettingsPath()).projects;
    const result = await dialog.showOpenDialog({
        title: "选择要监控的项目目录",
        properties: ["openDirectory"],
    });

    if (result.canceled || !result.filePaths[0]) {
        return projectResult({
            ok: true,
            canceled: true,
            projects: currentProjects,
        });
    }

    const selectedPath = result.filePaths[0];
    try {
        const selectedStats = await fs.promises.stat(selectedPath);
        if (!selectedStats.isDirectory()) {
            return projectError("PROJECT_NOT_DIRECTORY", "选择的路径不是文件夹。", currentProjects);
        }
        await fs.promises.access(selectedPath, fs.constants.R_OK);
    } catch (error) {
        return projectError("PROJECT_UNAVAILABLE", "无法访问选择的文件夹。", currentProjects);
    }

    try {
        const projects = updateMonitoredProjects([...currentProjects, selectedPath]);
        return projectResult({ ok: true, canceled: false, projects });
    } catch (error) {
        console.error("[settings] failed to add project:", error);
        return projectError("SETTINGS_WRITE_FAILED", "项目列表保存失败。", currentProjects);
    }
});

ipcMain.handle("settings:remove-project", async (_event, projectPath) => {
    const currentProjects = loadSettings(getSettingsPath()).projects;
    const normalizedPath = normalizeProjectPaths([projectPath])[0];

    if (!normalizedPath) {
        return projectError("INVALID_PROJECT_PATH", "要移除的项目路径无效。", currentProjects);
    }

    const pathToRemove = projectPathKey(normalizedPath);
    const nextProjects = currentProjects.filter(
        (currentPath) => projectPathKey(currentPath) !== pathToRemove,
    );

    if (nextProjects.length === currentProjects.length) {
        return projectResult({ ok: true, projects: currentProjects });
    }

    try {
        return projectResult({ ok: true, projects: updateMonitoredProjects(nextProjects) });
    } catch (error) {
        console.error("[settings] failed to remove project:", error);
        return projectError("SETTINGS_WRITE_FAILED", "项目列表保存失败。", currentProjects);
    }
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
