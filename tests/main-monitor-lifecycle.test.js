const assert = require("assert");
const Module = require("module");

const appHandlers = {};
const ipcHandlers = {};
let readyHandler = null;
const windows = [];
const monitors = [];

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
        monitors.push(this);
    }

    setProjects() {}
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
        on: (eventName, handler) => { appHandlers[eventName] = handler; },
        quit() {},
    },
    BrowserWindow: FakeBrowserWindow,
    ipcMain: { handle: (channel, handler) => { ipcHandlers[channel] = handler; } },
};

const originalLoad = Module._load;
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
    windows[0].handlers.closed();
    assert.strictEqual(monitors[0].stopCount, 1);
    assert.strictEqual(monitors[1].stopCount, 0);
    ipcHandlers["cc-refresh"]();
    assert.strictEqual(monitors[1].refreshCount, 2);
} finally {
    Module._load = originalLoad;
}

console.log("main monitor lifecycle ok");
