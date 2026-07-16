const assert = require("assert");
const Module = require("module");

const exposedAPIs = {};
const invocations = [];
const listeners = {};

const fakeElectron = {
    contextBridge: {
        exposeInMainWorld: (name, api) => {
            exposedAPIs[name] = api;
        },
    },
    ipcRenderer: {
        invoke: (channel, ...args) => {
            invocations.push({ channel, args });
            return Promise.resolve({ ok: true });
        },
        on: (channel, listener) => {
            listeners[channel] = listener;
        },
    },
};

const originalLoad = Module._load;
try {
    Module._load = function load(request, parent, isMain) {
        if (request === "electron") return fakeElectron;
        return originalLoad.call(this, request, parent, isMain);
    };

    require("../preload");

    assert.deepStrictEqual(Object.keys(exposedAPIs).sort(), ["ccAPI", "settingsAPI", "windowAPI"]);
    assert.deepStrictEqual(Object.keys(exposedAPIs.settingsAPI).sort(), [
        "chooseAndAddProject",
        "getPreferences",
        "getProjects",
        "removeProject",
        "setPetAlwaysOnTop",
    ]);
    assert.deepStrictEqual(Object.keys(exposedAPIs.windowAPI).sort(), [
        "closeDetail",
        "onOpenSettings",
        "openDetail",
    ]);

    exposedAPIs.settingsAPI.getProjects();
    exposedAPIs.settingsAPI.chooseAndAddProject();
    exposedAPIs.settingsAPI.removeProject("E:/project");
    exposedAPIs.settingsAPI.getPreferences();
    exposedAPIs.settingsAPI.setPetAlwaysOnTop(false);
    exposedAPIs.windowAPI.openDetail();
    exposedAPIs.windowAPI.closeDetail();

    assert.deepStrictEqual(invocations, [
        { channel: "settings:get-projects", args: [] },
        { channel: "settings:add-project", args: [] },
        { channel: "settings:remove-project", args: ["E:/project"] },
        { channel: "settings:get-preferences", args: [] },
        { channel: "settings:set-pet-always-on-top", args: [false] },
        { channel: "window:open-detail", args: [] },
        { channel: "window:close-detail", args: [] },
    ]);

    let receivedUpdate = null;
    exposedAPIs.ccAPI.onUpdate((data) => {
        receivedUpdate = data;
    });
    listeners["cc-update"](null, { projects: {} });
    assert.deepStrictEqual(receivedUpdate, { projects: {} });

    let settingsOpenCount = 0;
    exposedAPIs.windowAPI.onOpenSettings(() => {
        settingsOpenCount += 1;
    });
    listeners["settings:open"]();
    assert.strictEqual(settingsOpenCount, 1);
} finally {
    Module._load = originalLoad;
}

console.log("preload api ok");
