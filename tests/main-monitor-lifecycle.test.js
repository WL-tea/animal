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
        this.showCount = 0;
        this.focusCount = 0;
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
        this.showCount += 1;
    }

    focus() {
        this.focusCount += 1;
    }

    close() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.handlers.closed?.();
    }

    isDestroyed() {
        return this.destroyed;
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
        whenReady: () => ({ then: (handler) => { readyHandler = handler; } }),
        getPath: (name) => {
            assert.strictEqual(name, "userData");
            return tempRoot;
        },
        on: (eventName, handler) => { appHandlers[eventName] = handler; },
        quit() {},
    },
    BrowserWindow: FakeBrowserWindow,
    dialog: {
        showOpenDialog: async () => dialogResult,
    },
    ipcMain: { handle: (channel, handler) => { ipcHandlers[channel] = handler; } },
    screen: {
        getAllDisplays: () => [{ workArea: primaryWorkArea }],
        getPrimaryDisplay: () => ({ workArea: primaryWorkArea }),
        getDisplayNearestPoint: () => ({ workArea: primaryWorkArea }),
        getCursorScreenPoint: () => ({ x: 400, y: 300 }),
        on: (eventName, handler) => { screenHandlers[eventName] = handler; },
    },
};

const originalLoad = Module._load;
async function run() {
    try {
        Module._load = function load(request, parent, isMain) {
            if (request === "electron") return fakeElectron;
            if (request === "./cc-monitor" && parent?.filename.endsWith("main.js")) return FakeMonitor;
            return originalLoad.call(this, request, parent, isMain);
        };

        require("../main");
        readyHandler();

        assert.strictEqual(windows.length, 1, "startup should create only the pet window");
        assert.strictEqual(monitors.length, 1, "the app should own one shared monitor");
        const petWindow = windows[0];
        assert.match(petWindow.loadedFile, /renderer[\\/]index\.html$/);
        assert.strictEqual(petWindow.options.alwaysOnTop, true);
        assert.deepStrictEqual(monitors[0].projects, [
            path.resolve(configuredProject),
            path.resolve(missingProject),
        ]);

        appHandlers.activate();
        assert.strictEqual(windows.length, 1, "activate should reuse the existing pet window");

        ipcHandlers["window:open-detail"]();
        assert.strictEqual(windows.length, 2);
        const detailWindow = windows[1];
        assert.match(detailWindow.loadedFile, /renderer[\\/]detail-window\.html$/);
        assert.strictEqual(detailWindow.options.alwaysOnTop, false);
        detailWindow.handlers["ready-to-show"]();
        assert.strictEqual(detailWindow.showCount, 1);
        assert.strictEqual(detailWindow.focusCount, 1);

        ipcHandlers["window:open-detail"]();
        assert.strictEqual(windows.length, 2, "opening details again should reuse the window");
        assert.strictEqual(detailWindow.showCount, 2);
        assert.strictEqual(detailWindow.focusCount, 2);

        monitors[0].target.send("cc-update", { projects: {} });
        assert.strictEqual(petWindow.webContents.sent.length, 1);
        assert.strictEqual(detailWindow.webContents.sent.length, 1);

        ipcHandlers["window:close-detail"]();
        assert.strictEqual(detailWindow.destroyed, true);
        assert.strictEqual(monitors[0].stopCount, 0, "closing details must keep monitoring alive");

        const preferenceResult = await ipcHandlers["settings:get-preferences"]();
        assert.deepStrictEqual(preferenceResult, { ok: true, petAlwaysOnTop: true });
        const topmostResult = await ipcHandlers["settings:set-pet-always-on-top"](null, false);
        assert.deepStrictEqual(topmostResult, { ok: true, petAlwaysOnTop: false });
        assert.deepStrictEqual(petWindow.alwaysOnTopValues, [false]);

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
        assert.strictEqual(monitors[0].stopCount, 1);
        assert.strictEqual(reopenedDetailWindow.destroyed, true);

        appHandlers.activate();
        assert.strictEqual(monitors.length, 2, "reactivation should create a fresh monitor");
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
