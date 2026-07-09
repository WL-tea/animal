const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appJsPath = path.join(__dirname, "..", "renderer", "js", "app.js");
const appJs = fs.readFileSync(appJsPath, "utf-8");

let updateHandler = null;
let refreshCalled = false;

const window = {
    ccAPI: {
        onUpdate(handler) {
            updateHandler = handler;
        },
        refresh() {
            refreshCalled = true;
        },
    },
};

vm.runInNewContext(appJs, {
    window,
    console,
});

assert.strictEqual(typeof window.petApp, "object");
assert.strictEqual(typeof window.petApp.getCCData, "function");
assert.strictEqual(typeof updateHandler, "function");
assert.strictEqual(refreshCalled, true);

let emittedData = null;
window.petApp.on("cc:update", (data) => {
    emittedData = data;
});

const sampleData = {
    projects: {
        "E:/kaifa/animal": {
            lastCost: 1.23,
            lastTotalInputTokens: 456,
        },
    },
    timestamp: 123456,
};

updateHandler(sampleData);

assert.deepStrictEqual(window.petApp.getCCData(), sampleData);
assert.deepStrictEqual(emittedData, sampleData);

console.log("app cc flow ok");
