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

const alertMessages = [];
window.petApp.on("bubble:say", (data) => {
    alertMessages.push(data);
});

function createSession(sessionId, usedPercentage) {
    return {
        sessionId,
        context: {
            usedPercentage,
        },
    };
}

function sendSessions(sessions) {
    updateHandler({
        projects: {
            "E:/kaifa/animal": {
                sessions,
            },
        },
    });
}

const firstSessionId = "11111111-1111-4111-8111-111111111111";
const secondSessionId = "22222222-2222-4222-8222-222222222222";

sendSessions([createSession(firstSessionId, 79)]);
assert.strictEqual(alertMessages.length, 0, "initial data should only establish an alert baseline");

sendSessions([createSession(firstSessionId, 80)]);
assert.strictEqual(alertMessages.length, 1);
assert.match(alertMessages[0].message, /animal/);
assert.match(alertMessages[0].message, /80\.0%/);

sendSessions([createSession(firstSessionId, 81)]);
assert.strictEqual(alertMessages.length, 1, "updates inside the same range should not repeat alerts");

sendSessions([createSession(firstSessionId, 95)]);
assert.strictEqual(alertMessages.length, 2);
assert.match(alertMessages[1].message, /95\.0%/);
assert.match(alertMessages[1].message, /要爆了/);

sendSessions([createSession(firstSessionId, 96)]);
assert.strictEqual(alertMessages.length, 2, "danger updates should not repeat alerts");

sendSessions([createSession(firstSessionId, 79)]);
sendSessions([createSession(firstSessionId, 80)]);
assert.strictEqual(alertMessages.length, 3, "dropping below the threshold should re-arm the warning");

sendSessions([
    createSession(firstSessionId, 80),
    createSession(secondSessionId, 95),
]);
assert.strictEqual(alertMessages.length, 3, "a newly observed session should establish its own baseline");

sendSessions([
    createSession(firstSessionId, 80),
    createSession(secondSessionId, 79),
]);
sendSessions([
    createSession(firstSessionId, 80),
    createSession(secondSessionId, 95),
]);
assert.strictEqual(alertMessages.length, 4, "sessions should track threshold crossings independently");

sendSessions([createSession(firstSessionId, null)]);
sendSessions([createSession(firstSessionId, "95")]);
sendSessions([createSession(firstSessionId, 101)]);
assert.strictEqual(alertMessages.length, 4, "invalid percentages should not produce alerts");

console.log("app cc flow ok");
