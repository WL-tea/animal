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

    assert.deepStrictEqual(Object.keys(exposedAPIs).sort(), ["ccAPI", "settingsAPI"]);
    assert.deepStrictEqual(Object.keys(exposedAPIs.settingsAPI).sort(), [
        "chooseAndAddProject",
        "getProjects",
        "removeProject",
    ]);

    exposedAPIs.settingsAPI.getProjects();
    exposedAPIs.settingsAPI.chooseAndAddProject();
    exposedAPIs.settingsAPI.removeProject("E:/project");

    assert.deepStrictEqual(invocations, [
        { channel: "settings:get-projects", args: [] },
        { channel: "settings:add-project", args: [] },
        { channel: "settings:remove-project", args: ["E:/project"] },
    ]);

    let receivedUpdate = null;
    exposedAPIs.ccAPI.onUpdate((data) => {
        receivedUpdate = data;
    });
    listeners["cc-update"](null, { projects: {} });
    assert.deepStrictEqual(receivedUpdate, { projects: {} });
} finally {
    Module._load = originalLoad;
}

console.log("preload api ok");
