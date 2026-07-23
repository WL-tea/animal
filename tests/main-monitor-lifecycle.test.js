const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const os = require("os");
const path = require("path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "animal-main-settings-"));
const configuredProject = path.join(tempRoot, "configured-project");
const addedProject = path.join(tempRoot, "added-project");
const missingProject = path.join(tempRoot, "missing-project");
fs.mkdirSync(configuredProject);
fs.mkdirSync(addedProject);
fs.writeFileSync(path.join(tempRoot, "settings.json"), JSON.stringify({
    version: 1,
    projects: [configuredProject, missingProject],
}), "utf-8");

const appHandlers = {};
const ipcHandlers = {};
const screenHandlers = {};
let readyHandler = null;
const windows = [];
const monitors = [];
const trays = [];
let quitCount = 0;
let singleInstanceLockGranted = true;
let singleInstanceLockRequestCount = 0;
let dialogResult = {
    canceled: false,
    filePaths: [addedProject],
};

class FakeBrowserWindow {
    constructor(options) {
        this.options = options;
        this.handlers = {};
        this.loadedFile = null;
        this.destroyed = false;
        this.visible = options.show !== false;
        this.showCount = 0;
        this.hideCount = 0;
        this.focusCount = 0;
        this.moveTopCount = 0;
        this.restoreCount = 0;
        this.minimized = false;
        this.alwaysOnTopValues = [];
        this.bounds = { x: 100, y: 100, width: options.width, height: options.height };
        this.webContents = {
            sent: [],
            isDestroyed: () => this.destroyed,
            send: (channel, data) => this.webContents.sent.push({ channel, data }),
        };
        windows.push(this);
    }

    loadFile(filepath) {
        this.loadedFile = filepath;
    }

    on(eventName, handler) {
        this.handlers[eventName] = handler;
    }

    once(eventName, handler) {
        this.handlers[eventName] = handler;
    }

    show() {
        this.visible = true;
        this.showCount += 1;
    }

    hide() {
        this.visible = false;
        this.hideCount += 1;
    }

    focus() {
        this.focusCount += 1;
    }

    moveTop() {
        this.moveTopCount += 1;
    }

    isMinimized() {
        return this.minimized;
    }

    restore() {
        this.minimized = false;
        this.restoreCount += 1;
    }

    close() {
        if (this.destroyed) return;
        let prevented = false;
        this.handlers.close?.({ preventDefault: () => { prevented = true; } });
        if (prevented) return;
        this.destroy();
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.visible = false;
        this.handlers.closed?.();
    }

    isDestroyed() {
        return this.destroyed;
    }

    isVisible() {
        return this.visible;
    }

    setAlwaysOnTop(enabled) {
        this.alwaysOnTopValues.push(enabled);
    }

    getBounds() {
        return this.bounds;
    }

    setBounds(bounds) {
        this.bounds = { ...this.bounds, ...bounds };
    }
}

FakeBrowserWindow.getAllWindows = () => windows.filter((window) => !window.destroyed);

class FakeTray {
    constructor(image) {
        this.image = image;
        this.destroyed = false;
        this.tooltip = "";
        this.contextMenu = null;
        this.handlers = {};
        trays.push(this);
    }

    on(eventName, handler) {
        this.handlers[eventName] = handler;
    }

    emit(eventName) {
        this.handlers[eventName]?.();
    }

    setToolTip(tooltip) {
        this.tooltip = tooltip;
    }

    setContextMenu(menu) {
        this.contextMenu = menu;
    }

    destroy() {
        this.destroyed = true;
    }
}

const FakeMenu = {
    buildFromTemplate(template) {
        return {
            items: template,
            getMenuItemById(id) {
                return template.find((item) => item.id === id);
            },
        };
    },
};

class FakeMonitor {
    constructor(target) {
        this.target = target;
        this.stopCount = 0;
        this.refreshCount = 0;
        this.projects = [];
        monitors.push(this);
    }

    setProjects(projects) {
        this.projects = projects;
    }

    refresh() {
        this.refreshCount += 1;
    }

    stopWatching() {
        this.stopCount += 1;
    }
}

const primaryWorkArea = { x: 0, y: 0, width: 1920, height: 1080 };
const fakeElectron = {
    app: {
        requestSingleInstanceLock() {
            singleInstanceLockRequestCount += 1;
            return singleInstanceLockGranted;
        },
        whenReady: () => ({ then: (handler) => { readyHandler = handler; } }),
        getPath: (name) => {
            assert.strictEqual(name, "userData");
            return tempRoot;
        },
        on: (eventName, handler) => { appHandlers[eventName] = handler; },
        quit() {
            quitCount += 1;
            appHandlers["before-quit"]?.();
            FakeBrowserWindow.getAllWindows().forEach((window) => window.close());
            appHandlers["will-quit"]?.();
        },
    },
    BrowserWindow: FakeBrowserWindow,
    dialog: {
        showOpenDialog: async () => dialogResult,
    },
    ipcMain: { handle: (channel, handler) => { ipcHandlers[channel] = handler; } },
    Menu: FakeMenu,
    screen: {
        getAllDisplays: () => [{ workArea: primaryWorkArea }],
        getPrimaryDisplay: () => ({ workArea: primaryWorkArea }),
        getDisplayNearestPoint: () => ({ workArea: primaryWorkArea }),
        getCursorScreenPoint: () => ({ x: 400, y: 300 }),
        on: (eventName, handler) => { screenHandlers[eventName] = handler; },
    },
    Tray: FakeTray,
};

const originalLoad = Module._load;
async function run() {
    try {
        Module._load = function load(request, parent, isMain) {
            if (request === "electron") return fakeElectron;
            if (request === "./cc-monitor" && parent?.filename.endsWith("main.js")) return FakeMonitor;
            return originalLoad.call(this, request, parent, isMain);
        };

        const { resolveTrayIconPath } = require("../main");
        readyHandler();

        assert.strictEqual(singleInstanceLockRequestCount, 1, "startup should request one instance lock");
        assert.strictEqual(windows.length, 1, "startup should create only the pet window");
        assert.strictEqual(monitors.length, 1, "the app should own one shared monitor");
        assert.strictEqual(trays.length, 1, "startup should create one tray icon");
        const petWindow = windows[0];
        const tray = trays[0];
        assert.match(petWindow.loadedFile, /renderer[\\/]index\.html$/);
        assert.strictEqual(petWindow.options.alwaysOnTop, true);
        assert.strictEqual(petWindow.options.skipTaskbar, true);
        assert.match(tray.image, /assets[\\/]tray[\\/]tray-icon\.ico$/);
        assert.match(
            resolveTrayIconPath({
                baseDir: path.resolve(__dirname, ".."),
                platform: "win32",
                fileExists: (iconPath) => iconPath.endsWith("tray-icon-32.png"),
            }),
            /assets[\\/]tray[\\/]tray-icon-32\.png$/,
            "Windows should fall back to the PNG when the ICO is unavailable",
        );
        assert.strictEqual(
            resolveTrayIconPath({ fileExists: () => false }),
            null,
            "missing tray assets should use the safe empty-image fallback",
        );
        assert.strictEqual(tray.tooltip, "桌宠");
        assert.deepStrictEqual(
            tray.contextMenu.items.map((item) => item.type === "separator" ? "separator" : item.id),
            ["toggle-pet", "open-detail", "open-settings", "separator", "pet-always-on-top", "separator", "quit"],
        );
        assert.strictEqual(tray.contextMenu.getMenuItemById("toggle-pet").label, "隐藏桌宠");
        assert.strictEqual(tray.contextMenu.getMenuItemById("pet-always-on-top").checked, true);
        const originalQuit = fakeElectron.app.quit;
        fakeElectron.app.quit = () => { quitCount += 1; };
        tray.contextMenu.getMenuItemById("quit").click();
        assert.strictEqual(quitCount, 1, "the quit menu command should request app exit");
        quitCount = 0;
        fakeElectron.app.quit = originalQuit;
        assert.deepStrictEqual(monitors[0].projects, [
            path.resolve(configuredProject),
            path.resolve(missingProject),
        ]);

        tray.contextMenu.getMenuItemById("toggle-pet").click();
        assert.strictEqual(petWindow.isVisible(), false);
        assert.strictEqual(petWindow.hideCount, 1);
        assert.strictEqual(monitors[0].stopCount, 0, "hiding the pet must keep monitoring alive");
        assert.strictEqual(tray.contextMenu.getMenuItemById("toggle-pet").label, "显示桌宠");

        tray.contextMenu.getMenuItemById("toggle-pet").click();
        assert.strictEqual(petWindow.isVisible(), true);
        assert.strictEqual(tray.contextMenu.getMenuItemById("toggle-pet").label, "隐藏桌宠");

        tray.contextMenu.getMenuItemById("toggle-pet").click();
        petWindow.bounds = { x: 5000, y: 5000, width: 400, height: 600 };
        petWindow.minimized = true;
        const settingsBeforeTrayClick = fs.readFileSync(path.join(tempRoot, "settings.json"), "utf-8");
        tray.emit("click");
        tray.emit("click");
        assert.strictEqual(windows.length, 1, "repeated tray clicks should reuse the pet window");
        assert.strictEqual(petWindow.isVisible(), true, "tray click should reveal the pet");
        assert.strictEqual(petWindow.restoreCount, 1, "tray click should restore a minimized pet");
        assert.strictEqual(petWindow.focusCount, 3, "each tray click should intentionally request focus");
        assert.strictEqual(petWindow.moveTopCount, 3, "each tray click should move the pet forward once");
        assert.ok(petWindow.bounds.x >= 0 && petWindow.bounds.x < primaryWorkArea.width);
        assert.ok(petWindow.bounds.y >= 0 && petWindow.bounds.y < primaryWorkArea.height);
        assert.deepStrictEqual(petWindow.alwaysOnTopValues, [], "tray click must not change always-on-top");
        assert.strictEqual(
            fs.readFileSync(path.join(tempRoot, "settings.json"), "utf-8"),
            settingsBeforeTrayClick,
            "tray click must not persist preference changes",
        );
        assert.strictEqual(tray.handlers["double-click"], undefined, "double click is intentionally unbound");

        appHandlers.activate();
        assert.strictEqual(windows.length, 1, "activate should reuse the existing pet window");

        petWindow.hide();
        appHandlers["second-instance"]();
        assert.strictEqual(petWindow.isVisible(), true, "a second launch should reveal the primary pet");
        assert.strictEqual(windows.length, 1, "a second launch must reuse the primary window");
        assert.strictEqual(trays.length, 1, "a second launch must not create another tray");
        assert.strictEqual(monitors.length, 1, "a second launch must not create another monitor");

        ipcHandlers["window:open-detail"]();
        assert.strictEqual(windows.length, 2);
        const detailWindow = windows[1];
        assert.match(detailWindow.loadedFile, /renderer[\\/]detail-window\.html$/);
        assert.strictEqual(detailWindow.options.alwaysOnTop, false);
        assert.strictEqual(detailWindow.options.skipTaskbar, false);
        detailWindow.handlers["ready-to-show"]();
        assert.strictEqual(detailWindow.showCount, 1);
        assert.strictEqual(detailWindow.focusCount, 1);

        tray.contextMenu.getMenuItemById("open-settings").click();
        assert.strictEqual(windows.length, 2, "opening settings should reuse the detail window");
        assert.deepStrictEqual(detailWindow.webContents.sent.at(-1), {
            channel: "settings:open",
            data: undefined,
        });

        ipcHandlers["window:open-detail"]();
        assert.strictEqual(windows.length, 2, "opening details again should reuse the window");
        assert.strictEqual(detailWindow.showCount, 3);
        assert.strictEqual(detailWindow.focusCount, 3);

        monitors[0].target.send("cc-update", { projects: {} });
        assert.strictEqual(petWindow.webContents.sent.length, 1);
        assert.strictEqual(
            detailWindow.webContents.sent.filter(({ channel }) => channel === "cc-update").length,
            1,
        );

        ipcHandlers["window:close-detail"]();
        assert.strictEqual(detailWindow.destroyed, true);
        assert.strictEqual(monitors[0].stopCount, 0, "closing details must keep monitoring alive");

        const preferenceResult = await ipcHandlers["settings:get-preferences"]();
        assert.deepStrictEqual(preferenceResult, { ok: true, petAlwaysOnTop: true });
        const topmostResult = await ipcHandlers["settings:set-pet-always-on-top"](null, false);
        assert.deepStrictEqual(topmostResult, { ok: true, petAlwaysOnTop: false });
        assert.deepStrictEqual(petWindow.alwaysOnTopValues, [false]);
        assert.strictEqual(tray.contextMenu.getMenuItemById("pet-always-on-top").checked, false);

        ipcHandlers["window:open-detail"]();
        const reopenedDetailWindow = windows[2];
        reopenedDetailWindow.bounds = { x: 5000, y: 5000, width: 680, height: 520 };
        reopenedDetailWindow.handlers.moved();
        assert.ok(reopenedDetailWindow.bounds.x < 1920);
        assert.ok(reopenedDetailWindow.bounds.y < 1080);

        reopenedDetailWindow.bounds = { x: 5000, y: 5000, width: 680, height: 520 };
        screenHandlers["display-removed"]();
        assert.ok(reopenedDetailWindow.bounds.x < 1920);

        const getResult = await ipcHandlers["settings:get-projects"]();
        assert.strictEqual(getResult.ok, true);
        assert.deepStrictEqual(getResult.projectStatuses, [
            { path: path.resolve(configuredProject), status: "available" },
            { path: path.resolve(missingProject), status: "missing" },
        ]);

        const originalAccess = fs.promises.access;
        try {
            fs.promises.access = async (projectPath, mode) => {
                if (projectPath === path.resolve(addedProject)) {
                    const error = new Error("access denied");
                    error.code = "EACCES";
                    throw error;
                }
                return originalAccess(projectPath, mode);
            };

            const unavailableResult = await ipcHandlers["settings:add-project"]();
            assert.strictEqual(unavailableResult.ok, false);
            assert.strictEqual(unavailableResult.error.code, "PROJECT_UNAVAILABLE");
        } finally {
            fs.promises.access = originalAccess;
        }

        const addResult = await ipcHandlers["settings:add-project"]();
        assert.strictEqual(addResult.ok, true);
        assert.deepStrictEqual(monitors[0].projects, addResult.projects);
        assert.strictEqual(
            JSON.parse(fs.readFileSync(path.join(tempRoot, "settings.json"), "utf-8")).petAlwaysOnTop,
            false,
            "editing projects must preserve the topmost preference",
        );

        const removeResult = await ipcHandlers["settings:remove-project"](null, configuredProject);
        assert.strictEqual(removeResult.ok, true);
        assert.deepStrictEqual(monitors[0].projects, removeResult.projects);

        dialogResult = {
            canceled: false,
            filePaths: [path.join(tempRoot, "settings.json")],
        };
        const invalidAddResult = await ipcHandlers["settings:add-project"]();
        assert.strictEqual(invalidAddResult.ok, false);
        assert.strictEqual(invalidAddResult.error.code, "PROJECT_NOT_DIRECTORY");

        dialogResult = { canceled: true, filePaths: [] };
        const canceledResult = await ipcHandlers["settings:add-project"]();
        assert.strictEqual(canceledResult.ok, true);
        assert.strictEqual(canceledResult.canceled, true);

        petWindow.close();
        assert.strictEqual(petWindow.destroyed, true, "closing the pet should exit the app");
        assert.strictEqual(quitCount, 1);
        assert.strictEqual(monitors[0].stopCount, 1, "only quitting should stop monitoring");
        assert.strictEqual(tray.destroyed, true);
        assert.strictEqual(reopenedDetailWindow.destroyed, true);

        const mainModulePath = require.resolve("../main");
        const readyHandlerBeforeSecondProcess = readyHandler;
        const resourceCountsBeforeSecondProcess = {
            windows: windows.length,
            trays: trays.length,
            monitors: monitors.length,
        };
        let secondaryQuitCount = 0;
        singleInstanceLockGranted = false;
        fakeElectron.app.quit = () => { secondaryQuitCount += 1; };
        delete require.cache[mainModulePath];
        require("../main");

        assert.strictEqual(singleInstanceLockRequestCount, 2);
        assert.strictEqual(secondaryQuitCount, 1, "a secondary process should quit immediately");
        assert.strictEqual(readyHandler, readyHandlerBeforeSecondProcess, "a secondary process must not register startup");
        assert.deepStrictEqual(
            {
                windows: windows.length,
                trays: trays.length,
                monitors: monitors.length,
            },
            resourceCountsBeforeSecondProcess,
            "a secondary process must not create app resources",
        );
    } finally {
        Module._load = originalLoad;
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}

run()
    .then(() => console.log("main monitor lifecycle ok"))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
