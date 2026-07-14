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
let readyHandler = null;
const windows = [];
const monitors = [];
let dialogResult = {
    canceled: false,
    filePaths: [addedProject],
};

class FakeBrowserWindow {
    constructor() {
        this.handlers = {};
        this.webContents = {};
        windows.push(this);
    }

    loadFile() {}

    on(eventName, handler) {
        this.handlers[eventName] = handler;
    }
}

FakeBrowserWindow.getAllWindows = () => [];

class FakeMonitor {
    constructor() {
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
        appHandlers.activate();

        assert.strictEqual(monitors.length, 2);
        assert.deepStrictEqual(monitors[0].projects, [
            path.resolve(configuredProject),
            path.resolve(missingProject),
        ]);
        assert.deepStrictEqual(monitors[1].projects, monitors[0].projects);
        windows[0].handlers.closed();
        assert.strictEqual(monitors[0].stopCount, 1);
        assert.strictEqual(monitors[1].stopCount, 0);
        ipcHandlers["cc-refresh"]();
        assert.strictEqual(monitors[1].refreshCount, 2);

        const getResult = await ipcHandlers["settings:get-projects"]();
        assert.strictEqual(getResult.ok, true);
        assert.deepStrictEqual(getResult.projects, monitors[0].projects);
        assert.deepStrictEqual(getResult.projectStatuses, [
            { path: path.resolve(configuredProject), status: "available" },
            { path: path.resolve(missingProject), status: "missing" },
        ]);

        const originalAccess = fs.promises.access;
        try {
            fs.promises.access = async (projectPath, mode) => {
                if (projectPath === path.resolve(configuredProject)) {
                    const error = new Error("access denied");
                    error.code = "EACCES";
                    throw error;
                }
                return originalAccess(projectPath, mode);
            };

            const unreadableResult = await ipcHandlers["settings:get-projects"]();
            assert.deepStrictEqual(unreadableResult.projectStatuses[0], {
                path: path.resolve(configuredProject),
                status: "unreadable",
            });
        } finally {
            fs.promises.access = originalAccess;
        }

        try {
            fs.promises.access = async (projectPath, mode) => {
                if (projectPath === path.resolve(addedProject)) {
                    const error = new Error("access denied");
                    error.code = "EACCES";
                    throw error;
                }
                return originalAccess(projectPath, mode);
            };

            const unreadableAddResult = await ipcHandlers["settings:add-project"]();
            assert.strictEqual(unreadableAddResult.ok, false);
            assert.strictEqual(unreadableAddResult.error.code, "PROJECT_UNAVAILABLE");
            assert.deepStrictEqual(unreadableAddResult.projects, monitors[0].projects);
            assert.strictEqual(monitors[1].refreshCount, 2);
        } finally {
            fs.promises.access = originalAccess;
        }

        const addResult = await ipcHandlers["settings:add-project"]();
        assert.strictEqual(addResult.ok, true);
        assert.strictEqual(addResult.canceled, false);
        assert.deepStrictEqual(addResult.projects, [
            path.resolve(configuredProject),
            path.resolve(missingProject),
            path.resolve(addedProject),
        ]);
        assert.deepStrictEqual(monitors[1].projects, addResult.projects);
        assert.strictEqual(monitors[1].refreshCount, 3);

        const removeResult = await ipcHandlers["settings:remove-project"](null, configuredProject);
        assert.strictEqual(removeResult.ok, true);
        assert.deepStrictEqual(removeResult.projects, [
            path.resolve(missingProject),
            path.resolve(addedProject),
        ]);
        assert.deepStrictEqual(monitors[1].projects, removeResult.projects);
        assert.strictEqual(monitors[1].refreshCount, 4);

        dialogResult = {
            canceled: false,
            filePaths: [path.join(tempRoot, "settings.json")],
        };
        const invalidAddResult = await ipcHandlers["settings:add-project"]();
        assert.strictEqual(invalidAddResult.ok, false);
        assert.strictEqual(invalidAddResult.error.code, "PROJECT_NOT_DIRECTORY");
        assert.deepStrictEqual(invalidAddResult.projects, [
            path.resolve(missingProject),
            path.resolve(addedProject),
        ]);
        assert.strictEqual(monitors[1].refreshCount, 4);

        dialogResult = { canceled: true, filePaths: [] };
        const canceledResult = await ipcHandlers["settings:add-project"]();
        assert.strictEqual(canceledResult.ok, true);
        assert.strictEqual(canceledResult.canceled, true);
        assert.deepStrictEqual(canceledResult.projects, [
            path.resolve(missingProject),
            path.resolve(addedProject),
        ]);
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
