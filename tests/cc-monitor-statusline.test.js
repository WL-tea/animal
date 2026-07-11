const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");

const CCMonitor = require("../cc-monitor");

const projectPath = "E:/kaifa/animal";
const backupData = {
    [projectPath]: {
        lastCost: 2.5,
        lastTotalInputTokens: 367862,
        lastModelUsage: {},
    },
};
const snapshots = [
    {
        schemaVersion: 1,
        source: "claude-code",
        sessionId: "11111111-1111-4111-8111-111111111111",
        projectPath,
        currentDirectory: projectPath,
        model: { id: "deepseek-v4-flash[1m]", displayName: "DeepSeek" },
        context: {
            windowSize: 1000000,
            usedPercentage: 80,
            remainingPercentage: 20,
            totalInputTokens: 800000,
            totalOutputTokens: 100,
        },
        cost: { totalCostUsd: 1, totalDurationMs: 1, totalApiDurationMs: 1 },
        updatedAt: 100,
    },
    {
        schemaVersion: 1,
        source: "claude-code",
        sessionId: "22222222-2222-4222-8222-222222222222",
        projectPath: "E:\\kaifa\\animal",
        currentDirectory: "E:\\kaifa\\animal",
        model: { id: "deepseek-v4-flash[1m]", displayName: "DeepSeek" },
        context: {
            windowSize: 1000000,
            usedPercentage: 19.9573,
            remainingPercentage: 80.0427,
            totalInputTokens: 199573,
            totalOutputTokens: 23,
        },
        cost: { totalCostUsd: 2, totalDurationMs: 2, totalApiDurationMs: 2 },
        updatedAt: 200,
    },
];

assert.strictEqual(CCMonitor.isValidStatusSnapshot(snapshots[0]), true);
assert.strictEqual(CCMonitor.isValidStatusSnapshot({ ...snapshots[0], schemaVersion: 2 }), false);
assert.strictEqual(CCMonitor.isValidStatusSnapshot({ ...snapshots[0], sessionId: "bad" }), false);
assert.strictEqual(CCMonitor.isValidStatusSnapshot({
    ...snapshots[0],
    context: { ...snapshots[0].context, usedPercentage: 150 },
}), false);

const projects = CCMonitor.mergeProjectData([projectPath], backupData, snapshots);
const project = projects[projectPath];

assert.strictEqual(project.lastCost, 2.5);
assert.strictEqual(project.lastTotalInputTokens, 367862);
assert.strictEqual(project.sessions.length, 2);
assert.strictEqual(project.latestSessionId, snapshots[1].sessionId);
assert.strictEqual(project.contextWindowSize, 1000000);
assert.strictEqual(project.contextUsedPercentage, 19.9573);
assert.strictEqual(project.contextTotalInputTokens, 199573);

const snapshotOnly = CCMonitor.mergeProjectData([projectPath], {}, [snapshots[1]]);
assert.strictEqual(snapshotOnly[projectPath].latestSessionId, snapshots[1].sessionId);

const unrelated = CCMonitor.mergeProjectData([projectPath], backupData, [{
    ...snapshots[0],
    projectPath: "E:/other/project",
}]);
assert.strictEqual(unrelated[projectPath].sessions.length, 0);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "animal-monitor-"));
const originalConsoleError = console.error;
const loggedErrors = [];
try {
    console.error = (...args) => loggedErrors.push(args);
    const filename = `${snapshots[0].sessionId}.json`;
    const filepath = path.join(tempRoot, filename);
    const monitor = new CCMonitor(null, { snapshotDir: tempRoot });
    monitor.sessionSnapshots.set(filename, snapshots[0]);

    fs.writeFileSync(filepath, "{broken", "utf-8");
    monitor.readSnapshotFile(filepath);
    assert.deepStrictEqual(monitor.sessionSnapshots.get(filename), snapshots[0]);
    assert.strictEqual(loggedErrors.length, 1);
    assert.match(loggedErrors[0].join(" "), /statusLine/);

    fs.writeFileSync(filepath, JSON.stringify({ ...snapshots[0], schemaVersion: 2 }), "utf-8");
    monitor.readSnapshotFile(filepath);
    assert.deepStrictEqual(monitor.sessionSnapshots.get(filename), snapshots[0]);

    const malformedContexts = [
        { ...snapshots[0].context, remainingPercentage: "20" },
        { ...snapshots[0].context, totalInputTokens: {} },
        { ...snapshots[0].context, totalOutputTokens: -1 },
    ];

    for (const context of malformedContexts) {
        fs.writeFileSync(filepath, JSON.stringify({ ...snapshots[0], context }), "utf-8");
        monitor.readSnapshotFile(filepath);
        assert.deepStrictEqual(monitor.sessionSnapshots.get(filename), snapshots[0]);
    }

    assert.strictEqual(loggedErrors.length, 1);

    const mismatchedFilename = `${snapshots[1].sessionId}.json`;
    const mismatchedPath = path.join(tempRoot, mismatchedFilename);
    fs.writeFileSync(mismatchedPath, JSON.stringify(snapshots[0]), "utf-8");
    monitor.readSnapshotFile(mismatchedPath);
    assert.strictEqual(monitor.sessionSnapshots.has(mismatchedFilename), false);
} finally {
    console.error = originalConsoleError;
    fs.rmSync(tempRoot, { recursive: true, force: true });
}

const failureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "animal-monitor-failure-"));
const failureFilename = `${snapshots[0].sessionId}.json`;
const failurePath = path.join(failureRoot, failureFilename);
fs.writeFileSync(failurePath, JSON.stringify(snapshots[0]), "utf-8");

const sentUpdates = [];
const webContents = {
    isDestroyed: () => false,
    send: (_channel, payload) => sentUpdates.push(payload),
};
const failureMonitor = new CCMonitor(webContents, { snapshotDir: failureRoot });
failureMonitor.projects = [projectPath];
failureMonitor.backupData = backupData;

const originalMkdirSync = fs.mkdirSync;
const failureConsoleError = console.error;
console.error = (...args) => loggedErrors.push(args);
try {
    fs.mkdirSync = () => {
        throw new Error("snapshot directory unavailable");
    };
    assert.doesNotThrow(() => failureMonitor.startSnapshotWatching());
    assert.strictEqual(sentUpdates.at(-1).projects[projectPath].lastCost, 2.5);
    assert.deepStrictEqual(sentUpdates.at(-1).projects[projectPath].sessions, []);
    assert.strictEqual(sentUpdates.at(-1).projects[projectPath].contextWindowSize, null);
} finally {
    fs.mkdirSync = originalMkdirSync;
}

failureMonitor.refreshSnapshots();
assert.strictEqual(sentUpdates.at(-1).projects[projectPath].sessions.length, 1);

const originalReaddirSync = fs.readdirSync;
try {
    fs.readdirSync = () => {
        throw new Error("snapshot enumeration unavailable");
    };
    assert.doesNotThrow(() => failureMonitor.refreshSnapshots());
    assert.strictEqual(failureMonitor.sessionSnapshots.size, 1);
    assert.deepStrictEqual(sentUpdates.at(-1).projects[projectPath].sessions, []);
    assert.strictEqual(sentUpdates.at(-1).projects[projectPath].lastCost, 2.5);
} finally {
    fs.readdirSync = originalReaddirSync;
}

failureMonitor.refreshSnapshots();
assert.strictEqual(sentUpdates.at(-1).projects[projectPath].sessions.length, 1);

const watcher = new EventEmitter();
watcher.close = () => {};
const originalWatch = fs.watch;
try {
    fs.watch = () => watcher;
    failureMonitor.startSnapshotWatching();
    assert.doesNotThrow(() => watcher.emit("error", new Error("watcher failed")));
    assert.strictEqual(failureMonitor.sessionSnapshots.size, 1);
    assert.deepStrictEqual(sentUpdates.at(-1).projects[projectPath].sessions, []);
    assert.strictEqual(sentUpdates.at(-1).projects[projectPath].lastCost, 2.5);
} finally {
    fs.watch = originalWatch;
    console.error = failureConsoleError;
    failureMonitor.stopWatching();
    fs.rmSync(failureRoot, { recursive: true, force: true });
}

const recoveryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "animal-monitor-recovery-"));
const recoveryPath = path.join(recoveryRoot, failureFilename);
fs.writeFileSync(recoveryPath, JSON.stringify(snapshots[0]), "utf-8");
const recoveryUpdates = [];
const recoveryMonitor = new CCMonitor({
    isDestroyed: () => false,
    send: (_channel, payload) => recoveryUpdates.push(payload),
}, { snapshotDir: recoveryRoot });
recoveryMonitor.projects = [projectPath];
recoveryMonitor.backupData = backupData;

let replacementWatcher = null;
const originalExistsSync = fs.existsSync;
console.error = () => {};
try {
    fs.mkdirSync = () => {
        throw new Error("transient startup failure");
    };
    recoveryMonitor.startSnapshotWatching();
    assert.strictEqual(recoveryMonitor.snapshotWatcher, null);

    fs.mkdirSync = originalMkdirSync;
    fs.existsSync = (filepath) => filepath === recoveryRoot || filepath === recoveryPath;
    fs.watch = () => {
        replacementWatcher = new EventEmitter();
        replacementWatcher.close = () => {};
        return replacementWatcher;
    };
    recoveryMonitor.refresh();
    assert.ok(replacementWatcher, "refresh should install a replacement snapshot watcher");
    assert.strictEqual(recoveryMonitor.snapshotWatcher, replacementWatcher);

    replacementWatcher.emit("error", new Error("transient watcher failure"));
    assert.strictEqual(recoveryMonitor.snapshotWatcher, null);
    recoveryMonitor.refresh();
    assert.notStrictEqual(recoveryMonitor.snapshotWatcher, null);
} finally {
    fs.mkdirSync = originalMkdirSync;
    fs.existsSync = originalExistsSync;
    fs.watch = originalWatch;
    console.error = failureConsoleError;
    recoveryMonitor.stopWatching();
    fs.rmSync(recoveryRoot, { recursive: true, force: true });
}

const eventRoot = fs.mkdtempSync(path.join(os.tmpdir(), "animal-monitor-event-recovery-"));
const eventPath = path.join(eventRoot, failureFilename);
fs.writeFileSync(eventPath, JSON.stringify(snapshots[0]), "utf-8");
const eventUpdates = [];
const eventMonitor = new CCMonitor({
    isDestroyed: () => false,
    send: (_channel, payload) => eventUpdates.push(payload),
}, { snapshotDir: eventRoot });
eventMonitor.projects = [projectPath];
eventMonitor.backupData = backupData;

let watcherCallback = null;
const eventWatcher = new EventEmitter();
eventWatcher.close = () => {};
console.error = () => {};
try {
    fs.readdirSync = () => {
        throw new Error("transient enumeration failure");
    };
    fs.watch = (_directory, callback) => {
        watcherCallback = callback;
        return eventWatcher;
    };
    eventMonitor.startSnapshotWatching();
    assert.deepStrictEqual(eventUpdates.at(-1).projects[projectPath].sessions, []);

    fs.readdirSync = originalReaddirSync;
    watcherCallback("change", failureFilename);
    assert.strictEqual(eventUpdates.at(-1).projects[projectPath].sessions.length, 1);
    assert.strictEqual(eventUpdates.at(-1).projects[projectPath].contextWindowSize, 1000000);
} finally {
    fs.readdirSync = originalReaddirSync;
    fs.watch = originalWatch;
    console.error = failureConsoleError;
    eventMonitor.stopWatching();
    fs.rmSync(eventRoot, { recursive: true, force: true });
}

console.log("cc monitor statusLine merge ok");
