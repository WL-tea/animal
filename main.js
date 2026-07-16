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

const {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    Menu,
    nativeImage,
    screen,
    Tray,
} = electron;

// 只允许一个应用实例拥有托盘、窗口和监控器。
// 第二次启动会通知主实例，然后在创建任何应用资源前退出。
if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
}

const CCMonitor = require("./cc-monitor");
const {
    loadSettings,
    normalizeProjectPaths,
    saveSettings,
} = require("./settings-store");

let ccMonitor = null;
let petWindow = null;
let detailWindow = null;
let tray = null;
let isQuitting = false;

const DETAIL_WINDOW_SIZE = { width: 680, height: 520 };

function getSettingsPath() {
    return path.join(app.getPath("userData"), "settings.json");
}

function projectPathKey(projectPath) {
    return process.platform === "win32" ? projectPath.toLowerCase() : projectPath;
}

function updateMonitoredProjects(projects) {
    const currentSettings = loadSettings(getSettingsPath());
    const settings = saveSettings(getSettingsPath(), {
        ...currentSettings,
        projects,
    });

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

function isWindowAvailable(window) {
    return Boolean(window && !window.isDestroyed());
}

function sendToRendererWindows(channel, data) {
    [petWindow, detailWindow].forEach((window) => {
        if (isWindowAvailable(window) && !window.webContents.isDestroyed()) {
            window.webContents.send(channel, data);
        }
    });
}

function createMonitorTarget() {
    return {
        isDestroyed: () => isQuitting,
        send: sendToRendererWindows,
    };
}

function startMonitor(settings) {
    if (ccMonitor) return;

    ccMonitor = new CCMonitor(createMonitorTarget());
    ccMonitor.setProjects(settings.projects);
    ccMonitor.refresh();
}

function stopMonitor() {
    if (!ccMonitor) return;

    ccMonitor.stopWatching();
    ccMonitor = null;
}

function ensurePetWindowVisible() {
    if (!isWindowAvailable(petWindow)) return;

    const bounds = petWindow.getBounds();
    const isRecoverable = screen.getAllDisplays().some(({ workArea }) => {
        const overlapWidth = Math.max(0, Math.min(bounds.x + bounds.width, workArea.x + workArea.width)
            - Math.max(bounds.x, workArea.x));
        const overlapHeight = Math.max(0, Math.min(bounds.y + bounds.height, workArea.y + workArea.height)
            - Math.max(bounds.y, workArea.y));
        return overlapWidth >= 80 && overlapHeight >= 80;
    });

    if (isRecoverable) return;

    const cursor = screen.getCursorScreenPoint();
    const { workArea } = screen.getDisplayNearestPoint(cursor);
    petWindow.setBounds({
        x: Math.round(workArea.x + Math.max(0, (workArea.width - bounds.width) / 2)),
        y: Math.round(workArea.y + Math.max(0, (workArea.height - bounds.height) / 2)),
    });
}

function showPetWindow() {
    const win = createPetWindow();
    ensurePetWindowVisible();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.moveTop();
    refreshTrayMenu();
    return win;
}

function togglePetVisibility() {
    if (isWindowAvailable(petWindow) && petWindow.isVisible()) {
        petWindow.hide();
        refreshTrayMenu();
        return;
    }

    showPetWindow();
}

function buildTrayMenu() {
    const settings = loadSettings(getSettingsPath());
    const petIsVisible = isWindowAvailable(petWindow) && petWindow.isVisible();

    return Menu.buildFromTemplate([
        {
            id: "toggle-pet",
            label: petIsVisible ? "隐藏桌宠" : "显示桌宠",
            click: togglePetVisibility,
        },
        {
            id: "open-detail",
            label: "打开详情",
            click: () => showDetailWindow(),
        },
        {
            id: "open-settings",
            label: "打开设置",
            click: () => showDetailWindow({ openSettings: true }),
        },
        { type: "separator" },
        {
            id: "pet-always-on-top",
            label: "桌宠始终置顶",
            type: "checkbox",
            checked: settings.petAlwaysOnTop,
            click: (menuItem) => updatePetAlwaysOnTop(menuItem.checked),
        },
        { type: "separator" },
        {
            id: "quit",
            label: "退出应用",
            click: () => app.quit(),
        },
    ]);
}

function refreshTrayMenu() {
    if (!tray) return;
    tray.setContextMenu(buildTrayMenu());
}

function createTray() {
    if (tray) return tray;

    const iconPath = path.join(__dirname, "assets", "tray", "tray-icon-32.png");
    const trayImage = fs.existsSync(iconPath) ? iconPath : nativeImage.createEmpty();
    if (trayImage !== iconPath) {
        console.error(`[tray] icon not found: ${iconPath}`);
    }

    tray = new Tray(trayImage);
    tray.setToolTip("桌宠");
    tray.on("click", showPetWindow);
    refreshTrayMenu();
    return tray;
}

function createPetWindow() {
    if (isWindowAvailable(petWindow)) {
        return petWindow;
    }

    const settings = loadSettings(getSettingsPath());
    const win = new BrowserWindow({
        width: 400,
        height: 600,
        transparent: true,
        frame: false,
        alwaysOnTop: settings.petAlwaysOnTop,
        resizable: false,
        hasShadow: false,
        skipTaskbar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    petWindow = win;
    win.loadFile(path.join(__dirname, "renderer", "index.html"));

    win.on("closed", () => {
        if (petWindow === win) {
            petWindow = null;
        }

        if (!isQuitting) {
            app.quit();
        }
    });
    return win;
}

function centeredDetailBounds() {
    const cursor = screen.getCursorScreenPoint();
    const { workArea } = screen.getDisplayNearestPoint(cursor);

    return {
        x: Math.round(workArea.x + (workArea.width - DETAIL_WINDOW_SIZE.width) / 2),
        y: Math.round(workArea.y + (workArea.height - DETAIL_WINDOW_SIZE.height) / 2),
    };
}

function ensureDetailWindowVisible() {
    if (!isWindowAvailable(detailWindow)) return;

    const bounds = detailWindow.getBounds();
    const isRecoverable = screen.getAllDisplays().some(({ workArea }) => {
        const overlapWidth = Math.max(0, Math.min(bounds.x + bounds.width, workArea.x + workArea.width)
            - Math.max(bounds.x, workArea.x));
        const overlapHeight = Math.max(0, Math.min(bounds.y + bounds.height, workArea.y + workArea.height)
            - Math.max(bounds.y, workArea.y));
        return overlapWidth >= 80 && overlapHeight >= 40;
    });

    if (isRecoverable) return;

    const { workArea } = screen.getPrimaryDisplay();
    detailWindow.setBounds({
        x: Math.round(workArea.x + Math.max(0, (workArea.width - bounds.width) / 2)),
        y: Math.round(workArea.y + Math.max(0, (workArea.height - bounds.height) / 2)),
    });
}

function openSettingsInWindow(win) {
    if (isWindowAvailable(win) && !win.webContents.isDestroyed()) {
        win.webContents.send("settings:open");
    }
}

function showDetailWindow({ openSettings = false } = {}) {
    if (isWindowAvailable(detailWindow)) {
        ensureDetailWindowVisible();
        detailWindow.show();
        detailWindow.focus();
        if (openSettings) openSettingsInWindow(detailWindow);
        return detailWindow;
    }

    const position = centeredDetailBounds();
    const win = new BrowserWindow({
        ...DETAIL_WINDOW_SIZE,
        ...position,
        minWidth: 560,
        minHeight: 420,
        show: false,
        frame: false,
        transparent: false,
        backgroundColor: "#FAF8F5",
        alwaysOnTop: false,
        resizable: true,
        skipTaskbar: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    detailWindow = win;
    win.loadFile(path.join(__dirname, "renderer", "detail-window.html"));
    win.once("ready-to-show", () => {
        if (!isWindowAvailable(win)) return;

        ensureDetailWindowVisible();
        win.show();
        win.focus();
        if (openSettings) openSettingsInWindow(win);
    });
    win.on("closed", () => {
        if (detailWindow === win) {
            detailWindow = null;
        }
    });
    win.on("moved", () => {
        if (detailWindow === win) {
            ensureDetailWindowVisible();
        }
    });

    return win;
}

// 页面请求刷新数据时响应
ipcMain.handle("cc-refresh", () => {
    if (ccMonitor) ccMonitor.refresh();
});

ipcMain.handle("window:open-detail", () => {
    showDetailWindow();
    return { ok: true };
});

ipcMain.handle("window:close-detail", () => {
    if (isWindowAvailable(detailWindow)) {
        detailWindow.close();
    }
    return { ok: true };
});

ipcMain.handle("settings:get-projects", () => projectResult({
    ok: true,
    projects: loadSettings(getSettingsPath()).projects,
}));

ipcMain.handle("settings:get-preferences", () => ({
    ok: true,
    petAlwaysOnTop: loadSettings(getSettingsPath()).petAlwaysOnTop,
}));

function updatePetAlwaysOnTop(enabled) {
    const currentSettings = loadSettings(getSettingsPath());
    if (typeof enabled !== "boolean") {
        return {
            ok: false,
            petAlwaysOnTop: currentSettings.petAlwaysOnTop,
            error: { code: "INVALID_TOPMOST_VALUE", message: "置顶设置值无效。" },
        };
    }

    try {
        const settings = saveSettings(getSettingsPath(), {
            ...currentSettings,
            petAlwaysOnTop: enabled,
        });
        if (isWindowAvailable(petWindow)) {
            petWindow.setAlwaysOnTop(settings.petAlwaysOnTop);
        }
        refreshTrayMenu();
        return { ok: true, petAlwaysOnTop: settings.petAlwaysOnTop };
    } catch (error) {
        console.error("[settings] failed to update topmost preference:", error);
        return {
            ok: false,
            petAlwaysOnTop: currentSettings.petAlwaysOnTop,
            error: { code: "SETTINGS_WRITE_FAILED", message: "置顶设置保存失败。" },
        };
    }
}

ipcMain.handle("settings:set-pet-always-on-top", (_event, enabled) => (
    updatePetAlwaysOnTop(enabled)
));

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
    screen.on("display-removed", ensureDetailWindowVisible);
    screen.on("display-metrics-changed", ensureDetailWindowVisible);
    createPetWindow();
    createTray();
    startMonitor(loadSettings(getSettingsPath()));
});

app.on("activate", () => {
    showPetWindow();
});

app.on("second-instance", () => {
    showPetWindow();
});

app.on("before-quit", () => {
    isQuitting = true;
    stopMonitor();
});

app.on("will-quit", () => {
    if (tray) {
        tray.destroy();
        tray = null;
    }
});

// 托盘是应用常驻入口；所有窗口关闭后仍保持后台监控。
app.on("window-all-closed", () => {});
