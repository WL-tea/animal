# Claude Code statusLine Monitor Implementation Plan

> **状态：已完成，仅作历史实施记录。** statusLine 桥接、快照监控、真实上下文渲染、错误降级和监听恢复已经落地。当前行为以仓库代码、测试、设计文档和 GitHub Issue 为准。
>
> 文中的 `E:/kaifa/animal`、临时 worktree 和 `C:/Users/lenovo/.claude/settings.json` 命令记录的是实施时环境，其他机器或仓库移动后不能直接照搬。下方未勾选的步骤保留用于复盘当时的任务拆分，不表示功能仍未完成。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simulated 200K context calculation with accurate Claude Code statusLine snapshots while preserving the existing status bar and backup-based aggregate statistics.

**Architecture:** A standalone Node bridge reads Claude Code statusLine JSON from stdin, prints the current progress bar, and atomically writes one sanitized snapshot per session under `data/cc-sessions/`. `cc-monitor.js` watches those files, merges their context data with existing backup aggregates, and sends the compatible project payload through the existing `cc:update` flow. `detail.js` renders the new context fields and safely degrades when they are unavailable.

**Tech Stack:** Node.js CommonJS, Electron 30, native `fs`/`path`, browser DOM APIs, Node `assert` and `vm` tests.

## Global Constraints

- Keep four-space indentation in JavaScript, HTML, and CSS.
- Do not introduce a frontend framework or new runtime dependency.
- Preserve `cc-monitor -> preload -> app.js -> UI` single-direction data flow.
- Keep `preload.js`, `window.ccAPI`, `cc:update`, and existing aggregate fields compatible in this change.
- Runtime snapshots and statusLine backups must remain ignored by Git.
- Never store prompt text, response text, credentials, or `transcript_path` in snapshots.
- Missing or invalid context data must produce `context: null`; never infer 200K or 1M from the model name in the bridge.
- A bridge or snapshot failure must not make Claude Code's statusLine command fail.
- Explain each file change and receive explicit user confirmation immediately before editing that group of files.
- Receive a separate explicit confirmation before editing `~/.claude/settings.json` or making a live DeepSeek request.
- Do not push, create a pull request, or update other GitHub remote state without explicit confirmation.

---

## File Map

- Create `claude-statusline-bridge.js`: parse statusLine input, format the visible bar, sanitize the snapshot, and write it atomically.
- Create `tests/claude-statusline-bridge.test.js`: unit and filesystem tests for the bridge.
- Modify `.gitignore`: ignore session snapshots and the user-specific statusLine backup.
- Modify `cc-monitor.js`: load, watch, validate, merge, and publish session snapshots.
- Create `tests/cc-monitor-statusline.test.js`: pure merge tests and watcher-facing validation tests.
- Modify `renderer/js/detail.js`: render real context values and the unavailable state.
- Create `tests/detail-context.test.js`: exercise detail rendering in a VM with a minimal DOM stub.
- Modify `package.json`: add one command that runs all Node tests.
- Create `docs/notes/07-Claude-Code状态栏数据桥接.md`: record the reusable learning concepts and data-source distinction.
- Modify user file `C:/Users/lenovo/.claude/settings.json` only after a separate confirmation: replace only its `statusLine` object.
- Create ignored runtime file `data/statusline-backup.json` only after the same confirmation: preserve only the original `statusLine` object.

---

### Task 1: Build the statusLine snapshot bridge

**Files:**
- Create: `claude-statusline-bridge.js`
- Create: `tests/claude-statusline-bridge.test.js`
- Modify: `.gitignore:1-5`

**Interfaces:**
- Consumes: Claude Code statusLine JSON on stdin with `session_id`, `workspace`, `model`, `context_window`, and `cost`.
- Produces: `formatStatusLine(input): string`, `normalizeStatusInput(input, updatedAt): object | null`, `writeSnapshot(snapshot, snapshotDir): string`, and CLI stdout.

- [ ] **Step 1: Explain the bridge files and receive confirmation**

Explain that this task adds a standalone data adapter, its tests, and ignored runtime paths. Explain stdin parsing, data minimization, session ID validation, and atomic replacement. Wait for explicit confirmation before editing.

- [ ] **Step 2: Write the failing bridge test**

Create `tests/claude-statusline-bridge.test.js`:

```js
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
    formatStatusLine,
    normalizeStatusInput,
    writeSnapshot,
} = require("../claude-statusline-bridge");

const sampleInput = {
    session_id: "8419c2fa-6ccc-4aed-b262-c4488c120a07",
    cwd: "E:/kaifa/animal",
    workspace: {
        project_dir: "E:/kaifa/animal",
        current_dir: "E:/kaifa/animal",
    },
    model: {
        id: "deepseek-v4-flash[1m]",
        display_name: "DeepSeek",
    },
    context_window: {
        total_input_tokens: 199573,
        total_output_tokens: 23,
        context_window_size: 1000000,
        used_percentage: 19.9573,
        remaining_percentage: 80.0427,
        current_usage: {
            input_tokens: 1429,
            output_tokens: 23,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 198144,
        },
    },
    cost: {
        total_cost_usd: 1.25,
        total_duration_ms: 9000,
        total_api_duration_ms: 3200,
    },
    transcript_path: "C:/private/conversation.jsonl",
};

const updatedAt = 1783660000000;
const snapshot = normalizeStatusInput(sampleInput, updatedAt);

assert.strictEqual(snapshot.schemaVersion, 1);
assert.strictEqual(snapshot.source, "claude-code");
assert.strictEqual(snapshot.projectPath, "E:/kaifa/animal");
assert.strictEqual(snapshot.model.id, "deepseek-v4-flash[1m]");
assert.strictEqual(snapshot.context.windowSize, 1000000);
assert.strictEqual(snapshot.context.usedPercentage, 19.9573);
assert.strictEqual(snapshot.context.totalInputTokens, 199573);
assert.strictEqual(snapshot.updatedAt, updatedAt);
assert.strictEqual(Object.hasOwn(snapshot, "transcriptPath"), false);
assert.strictEqual(formatStatusLine(sampleInput), "DeepSeek [#.........] 19%");

const noContext = normalizeStatusInput({
    ...sampleInput,
    context_window: {
        context_window_size: null,
        used_percentage: null,
    },
}, updatedAt);
assert.strictEqual(noContext.context, null);

const invalidSession = normalizeStatusInput({
    ...sampleInput,
    session_id: "../../escape",
}, updatedAt);
assert.strictEqual(invalidSession, null);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "animal-statusline-"));
try {
    const filepath = writeSnapshot(snapshot, tempRoot);
    assert.strictEqual(path.basename(filepath), `${sampleInput.session_id}.json`);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(filepath, "utf-8")), snapshot);
    assert.deepStrictEqual(fs.readdirSync(tempRoot), [`${sampleInput.session_id}.json`]);
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("claude statusLine bridge ok");
```

- [ ] **Step 3: Run the bridge test and verify the red state**

Run:

```powershell
node tests/claude-statusline-bridge.test.js
```

Expected: FAIL with `Cannot find module '../claude-statusline-bridge'`.

- [ ] **Step 4: Implement the minimal bridge**

Create `claude-statusline-bridge.js`:

```js
const fs = require("fs");
const path = require("path");

const DEFAULT_SNAPSHOT_DIR = path.join(__dirname, "data", "cc-sessions");
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function formatStatusLine(input) {
    const modelName = input?.model?.display_name || "Claude Code";
    const rawPercentage = input?.context_window?.used_percentage;
    const percentage = isFiniteNumber(rawPercentage) ? clamp(rawPercentage, 0, 100) : 0;
    const filled = Math.floor(percentage / 10);
    const bar = `[${"#".repeat(filled)}${".".repeat(10 - filled)}]`;

    return `${modelName} ${bar} ${Math.floor(percentage)}%`;
}

function normalizeStatusInput(input, updatedAt = Date.now()) {
    const sessionId = input?.session_id;
    const projectPath = input?.workspace?.project_dir || input?.cwd;
    const currentDirectory = input?.workspace?.current_dir || input?.cwd;

    if (!SESSION_ID_PATTERN.test(sessionId || "") || typeof projectPath !== "string" || !projectPath) {
        return null;
    }

    const contextWindow = input?.context_window;
    const hasContext = isFiniteNumber(contextWindow?.context_window_size)
        && contextWindow.context_window_size > 0
        && isFiniteNumber(contextWindow?.used_percentage)
        && contextWindow.used_percentage >= 0
        && contextWindow.used_percentage <= 100;

    return {
        schemaVersion: 1,
        source: "claude-code",
        sessionId,
        projectPath,
        currentDirectory,
        model: {
            id: input?.model?.id || "unknown",
            displayName: input?.model?.display_name || "Unknown",
        },
        context: hasContext ? {
            windowSize: contextWindow.context_window_size,
            usedPercentage: contextWindow.used_percentage,
            remainingPercentage: isFiniteNumber(contextWindow.remaining_percentage)
                ? contextWindow.remaining_percentage
                : null,
            totalInputTokens: isFiniteNumber(contextWindow.total_input_tokens)
                ? contextWindow.total_input_tokens
                : 0,
            totalOutputTokens: isFiniteNumber(contextWindow.total_output_tokens)
                ? contextWindow.total_output_tokens
                : 0,
        } : null,
        cost: {
            totalCostUsd: isFiniteNumber(input?.cost?.total_cost_usd) ? input.cost.total_cost_usd : 0,
            totalDurationMs: isFiniteNumber(input?.cost?.total_duration_ms) ? input.cost.total_duration_ms : 0,
            totalApiDurationMs: isFiniteNumber(input?.cost?.total_api_duration_ms)
                ? input.cost.total_api_duration_ms
                : 0,
        },
        updatedAt,
    };
}

function writeSnapshot(snapshot, snapshotDir = DEFAULT_SNAPSHOT_DIR) {
    fs.mkdirSync(snapshotDir, { recursive: true });
    const filepath = path.join(snapshotDir, `${snapshot.sessionId}.json`);
    const temporaryPath = `${filepath}.${process.pid}.tmp`;

    fs.writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 4)}\n`, "utf-8");
    fs.renameSync(temporaryPath, filepath);
    return filepath;
}

function readStdin() {
    return new Promise((resolve, reject) => {
        let input = "";
        process.stdin.setEncoding("utf-8");
        process.stdin.on("data", (chunk) => {
            input += chunk;
        });
        process.stdin.on("end", () => resolve(input));
        process.stdin.on("error", reject);
    });
}

async function main() {
    let input = null;

    try {
        input = JSON.parse(await readStdin());
        const snapshot = normalizeStatusInput(input);
        if (snapshot) {
            writeSnapshot(snapshot);
        }
    } catch (err) {
        process.stderr.write(`[animal statusLine] ${err.message}\n`);
    }

    process.stdout.write(`${formatStatusLine(input)}\n`);
}

if (require.main === module) {
    main().catch((err) => {
        process.stderr.write(`[animal statusLine] ${err.message}\n`);
        process.stdout.write("Claude Code [..........] 0%\n");
    });
}

module.exports = {
    DEFAULT_SNAPSHOT_DIR,
    formatStatusLine,
    normalizeStatusInput,
    writeSnapshot,
};
```

Add to `.gitignore`:

```gitignore
data/cc-sessions/
data/statusline-backup.json
```

- [ ] **Step 5: Run bridge verification**

Run:

```powershell
node tests/claude-statusline-bridge.test.js
node --check claude-statusline-bridge.js
git diff --check
```

Expected: `claude statusLine bridge ok`, both commands exit 0, and `git diff --check` prints nothing.

- [ ] **Step 6: Commit the bridge**

```powershell
git add -- .gitignore claude-statusline-bridge.js tests/claude-statusline-bridge.test.js
git commit -m "✨ 添加 statusLine 快照桥接"
```

Expected: one local commit containing only the three listed files.

---

### Task 2: Merge session snapshots into CCMonitor

**Files:**
- Modify: `cc-monitor.js:11-120`
- Create: `tests/cc-monitor-statusline.test.js`

**Interfaces:**
- Consumes: schema version 1 snapshots produced by `normalizeStatusInput` and the existing `backupData` project map.
- Produces: `mergeProjectData(projectPaths, backupData, snapshots): object` plus project objects containing `sessions`, `latestSessionId`, and top-level `context*` fields.

- [ ] **Step 1: Explain the monitor merge and receive confirmation**

Explain that this task changes only Node-side monitoring and tests. Cover separate backup/session watchers, last-known-good behavior, path normalization, and why online/offline inference remains unchanged. Wait for explicit confirmation.

- [ ] **Step 2: Write the failing monitor test**

Create `tests/cc-monitor-statusline.test.js`:

```js
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

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
try {
    const filename = `${snapshots[0].sessionId}.json`;
    const filepath = path.join(tempRoot, filename);
    const monitor = new CCMonitor(null, { snapshotDir: tempRoot });
    monitor.sessionSnapshots.set(filename, snapshots[0]);

    fs.writeFileSync(filepath, "{broken", "utf-8");
    monitor.readSnapshotFile(filepath);
    assert.deepStrictEqual(monitor.sessionSnapshots.get(filename), snapshots[0]);

    fs.writeFileSync(filepath, JSON.stringify({ ...snapshots[0], schemaVersion: 2 }), "utf-8");
    monitor.readSnapshotFile(filepath);
    assert.deepStrictEqual(monitor.sessionSnapshots.get(filename), snapshots[0]);
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("cc monitor statusLine merge ok");
```

- [ ] **Step 3: Run the monitor test and verify the red state**

Run:

```powershell
node tests/cc-monitor-statusline.test.js
```

Expected: FAIL because `CCMonitor.isValidStatusSnapshot` is not defined.

- [ ] **Step 4: Add snapshot validation and pure merge helpers**

Add near the top of `cc-monitor.js`:

```js
const STATUS_SNAPSHOT_VERSION = 1;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function isValidContext(context) {
    return context === null || (
        isFiniteNumber(context?.windowSize)
        && context.windowSize > 0
        && isFiniteNumber(context?.usedPercentage)
        && context.usedPercentage >= 0
        && context.usedPercentage <= 100
    );
}

function isValidStatusSnapshot(snapshot) {
    return snapshot?.schemaVersion === STATUS_SNAPSHOT_VERSION
        && snapshot.source === "claude-code"
        && SESSION_ID_PATTERN.test(snapshot.sessionId || "")
        && typeof snapshot.projectPath === "string"
        && snapshot.projectPath.length > 0
        && isFiniteNumber(snapshot.updatedAt)
        && isValidContext(snapshot.context);
}

function createSessionState(snapshot) {
    return {
        source: snapshot.source,
        sessionId: snapshot.sessionId,
        currentDirectory: snapshot.currentDirectory,
        model: snapshot.model,
        context: snapshot.context,
        updatedAt: snapshot.updatedAt,
    };
}

function mergeProjectData(projectPaths, backupData, snapshots) {
    const projects = {};

    for (const configuredPath of projectPaths) {
        const projectPath = normalizeProjectPath(configuredPath);
        const sessions = snapshots
            .filter(isValidStatusSnapshot)
            .filter((snapshot) => normalizeProjectPath(snapshot.projectPath) === projectPath)
            .sort((left, right) => right.updatedAt - left.updatedAt)
            .map(createSessionState);
        const aggregate = backupData[projectPath] || backupData[configuredPath] || null;

        if (!aggregate && sessions.length === 0) {
            continue;
        }

        const latest = sessions[0] || null;
        projects[projectPath] = {
            ...(aggregate || {}),
            sessions,
            latestSessionId: latest?.sessionId || null,
            contextWindowSize: latest?.context?.windowSize ?? null,
            contextUsedPercentage: latest?.context?.usedPercentage ?? null,
            contextRemainingPercentage: latest?.context?.remainingPercentage ?? null,
            contextTotalInputTokens: latest?.context?.totalInputTokens ?? null,
            contextTotalOutputTokens: latest?.context?.totalOutputTokens ?? null,
        };
    }

    return projects;
}
```

After `module.exports = CCMonitor`, export the helpers:

```js
module.exports.isValidStatusSnapshot = isValidStatusSnapshot;
module.exports.mergeProjectData = mergeProjectData;
```

- [ ] **Step 5: Add snapshot state and watcher methods**

Change the constructor signature and state:

```js
constructor(webContents, options = {}) {
    this.webContents = webContents;
    this.projects = [];
    this.backupWatcher = null;
    this.snapshotWatcher = null;
    this.backupData = {};
    this.sessionSnapshots = new Map();
    this.snapshotDir = options.snapshotDir || path.join(__dirname, "data", "cc-sessions");
}
```

Replace `startWatching()` with separate startup logic and add these methods:

```js
startWatching() {
    this.startBackupWatching();
    this.startSnapshotWatching();
}

startBackupWatching() {
    if (this.backupWatcher) return;

    const backupDir = path.join(CLAUDE_HOME, "backups");
    if (!fs.existsSync(backupDir)) return;

    this.backupWatcher = fs.watch(backupDir, (_eventType, filename) => {
        if (filename && isBackupFile(filename)) {
            this.readBackupFile(path.join(backupDir, filename));
        }
    });
}

startSnapshotWatching() {
    if (this.snapshotWatcher) return;

    fs.mkdirSync(this.snapshotDir, { recursive: true });
    this.refreshSnapshots();
    this.snapshotWatcher = fs.watch(this.snapshotDir, (_eventType, filename) => {
        if (!filename || !filename.endsWith(".json")) return;

        const filepath = path.join(this.snapshotDir, filename);
        if (!fs.existsSync(filepath)) {
            this.sessionSnapshots.delete(filename);
            this.sendToRenderer();
            return;
        }

        this.readSnapshotFile(filepath);
    });
}

readSnapshotFile(filepath) {
    try {
        const snapshot = JSON.parse(fs.readFileSync(filepath, "utf-8"));
        if (!isValidStatusSnapshot(snapshot)) return;

        this.sessionSnapshots.set(path.basename(filepath), snapshot);
        this.sendToRenderer();
    } catch (err) {
        console.error("[CC] 读取 statusLine 快照失败:", err.message);
    }
}

refreshSnapshots() {
    fs.mkdirSync(this.snapshotDir, { recursive: true });
    const files = fs.readdirSync(this.snapshotDir).filter((filename) => filename.endsWith(".json"));
    const existingFiles = new Set(files);

    for (const filename of this.sessionSnapshots.keys()) {
        if (!existingFiles.has(filename)) {
            this.sessionSnapshots.delete(filename);
        }
    }

    for (const filename of files) {
        this.readSnapshotFile(path.join(this.snapshotDir, filename));
    }

    this.sendToRenderer();
}
```

Replace the payload inside `sendToRenderer()`:

```js
const projects = mergeProjectData(
    this.projects,
    this.backupData,
    Array.from(this.sessionSnapshots.values()),
);

this.webContents.send("cc-update", {
    projects,
    timestamp: Date.now(),
});
```

Replace `refresh()` so missing backups do not skip snapshot refresh:

```js
refresh() {
    const backupDir = path.join(CLAUDE_HOME, "backups");

    if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir)
            .filter(isBackupFile)
            .sort()
            .reverse();

        if (files.length > 0) {
            this.readBackupFile(path.join(backupDir, files[0]));
        }
    }

    this.refreshSnapshots();
}
```

Replace `stopWatching()`:

```js
stopWatching() {
    if (this.backupWatcher) {
        this.backupWatcher.close();
        this.backupWatcher = null;
    }

    if (this.snapshotWatcher) {
        this.snapshotWatcher.close();
        this.snapshotWatcher = null;
    }
}
```

- [ ] **Step 6: Run monitor verification**

Run:

```powershell
node tests/cc-monitor-statusline.test.js
node --check cc-monitor.js
node tests/app-cc-flow.test.js
```

Expected: `cc monitor statusLine merge ok`, `app cc flow ok`, and all commands exit 0.

- [ ] **Step 7: Commit the monitor integration**

```powershell
git add -- cc-monitor.js tests/cc-monitor-statusline.test.js
git commit -m "♻️ 接入 statusLine 会话快照"
```

Expected: one local commit containing the monitor and its test.

---

### Task 3: Render accurate context data in the detail panel

**Files:**
- Modify: `renderer/js/detail.js:73-146`
- Create: `tests/detail-context.test.js`

**Interfaces:**
- Consumes: `contextWindowSize`, `contextUsedPercentage`, `contextTotalInputTokens`, and `contextTotalOutputTokens` on the selected project.
- Produces: real progress markup or the exact empty text `上下文数据不可用`.

- [ ] **Step 1: Explain the renderer change and receive confirmation**

Explain that this task removes the simulated formula, adds formatting helpers, and changes only the detail panel DOM output. Explain raw-number calculation versus formatted display. Wait for explicit confirmation.

- [ ] **Step 2: Write the failing detail test**

Create `tests/detail-context.test.js`:

```js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const detailJs = fs.readFileSync(
    path.join(__dirname, "..", "renderer", "js", "detail.js"),
    "utf-8",
);

const panel = { hidden: true };
const content = { innerHTML: "" };
const list = {
    innerHTML: "",
    querySelectorAll() {
        return [];
    },
};
const document = {
    addEventListener() {},
    querySelector(selector) {
        if (selector === "#detail-panel") return panel;
        if (selector === "#detail-content") return content;
        if (selector === "#detail-list") return list;
        return null;
    },
};
const context = {
    console,
    document,
    window: {
        petApp: {
            getCCData() {
                return null;
            },
            on() {},
        },
    },
};

vm.createContext(context);
vm.runInContext(detailJs, context);

context.updateProjectList({
    projects: {
        "E:/kaifa/animal": {
            contextWindowSize: 1000000,
            contextUsedPercentage: 19.9573,
            contextTotalInputTokens: 199573,
            contextTotalOutputTokens: 23,
        },
    },
});
context.renderProjectDetail();

assert.match(content.innerHTML, /19\.96%/);
assert.match(content.innerHTML, /1M 上限/);
assert.doesNotMatch(content.innerHTML, /200K 上限/);

context.updateProjectList({
    projects: {
        "E:/kaifa/animal": {
            contextWindowSize: null,
            contextUsedPercentage: null,
        },
    },
});
context.renderProjectDetail();

assert.match(content.innerHTML, /上下文数据不可用/);
assert.doesNotMatch(content.innerHTML, /0%/);

console.log("detail context rendering ok");
```

- [ ] **Step 3: Run the detail test and verify the red state**

Run:

```powershell
node tests/detail-context.test.js
```

Expected: FAIL because the current panel still renders the simulated 200K calculation.

- [ ] **Step 4: Add formatting helpers and replace the simulated context markup**

Add before `renderProjectDetail()`:

```js
function formatContextPercentage(value) {
    return `${Number(value.toFixed(2)).toLocaleString()}%`;
}

function formatContextLimit(value) {
    if (value >= 1000000 && value % 1000000 === 0) {
        return `${value / 1000000}M 上限`;
    }

    if (value >= 1000 && value % 1000 === 0) {
        return `${value / 1000}K 上限`;
    }

    return `${value.toLocaleString()} 上限`;
}

function renderContextSection(proj) {
    const contextWindowSize = proj.contextWindowSize;
    const contextUsedPercentage = proj.contextUsedPercentage;
    const hasContext = Number.isFinite(contextWindowSize)
        && Number.isFinite(contextUsedPercentage);

    if (!hasContext) {
        return `
            <div class="detail-section">
                <div class="detail-label">上下文</div>
                <div class="detail-empty">上下文数据不可用</div>
            </div>
        `;
    }

    const progressWidth = Math.min(100, Math.max(0, contextUsedPercentage));
    return `
        <div class="detail-section">
            <div class="detail-label">上下文</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width:${progressWidth}%"></div>
            </div>
            <div class="detail-stats">
                <span>${formatContextPercentage(contextUsedPercentage)}</span>
                <span>${formatContextLimit(contextWindowSize)}</span>
            </div>
        </div>
    `;
}
```

Remove this old calculation:

```js
const contextPercent = Math.min(100, Math.round((rawInputTokens / 200000) * 100));
```

Replace the existing inline context `<div class="detail-section">` block in `contentEl.innerHTML` with:

```js
${renderContextSection(proj)}
```

- [ ] **Step 5: Run renderer verification**

Run:

```powershell
node tests/detail-context.test.js
node --check renderer/js/detail.js
node tests/app-cc-flow.test.js
```

Expected: `detail context rendering ok`, `app cc flow ok`, and all commands exit 0.

- [ ] **Step 6: Commit the detail change**

```powershell
git add -- renderer/js/detail.js tests/detail-context.test.js
git commit -m "🐛 使用真实上下文数据"
```

Expected: one local commit containing the renderer change and its regression test.

---

### Task 4: Add the test command and learning note

**Files:**
- Modify: `package.json:6-12`
- Create: `docs/notes/07-Claude-Code状态栏数据桥接.md`

**Interfaces:**
- Consumes: the four standalone Node test files.
- Produces: `npm test` as the repository-wide automated check and a reusable learning note.

- [ ] **Step 1: Explain the test command and note, then receive confirmation**

Explain that this task changes developer workflow and documentation only. Cover why one test command prevents skipping a newly added test and why statusLine versus backup versus JSONL is reusable knowledge. Wait for explicit confirmation.

- [ ] **Step 2: Add the test script**

Add this entry to `package.json` under `scripts`:

```json
"test": "node tests/app-cc-flow.test.js && node tests/claude-statusline-bridge.test.js && node tests/cc-monitor-statusline.test.js && node tests/detail-context.test.js"
```

- [ ] **Step 3: Write the learning note**

Create `docs/notes/07-Claude-Code状态栏数据桥接.md` with these exact sections:

```markdown
# Claude Code 状态栏数据桥接

## 一、看到的现象

backup 中的 `lastTotalInputTokens` 是累计数据。把它除以固定的 200K 会让 1M DeepSeek 会话错误显示为 100%。

## 二、三个数据来源的区别

- backup：适合累计费用、累计 Token 和模型用量。
- JSONL：包含每次 API 响应的 usage，但有重复消息，模型名也可能丢失 `[1m]`。
- statusLine：由 Claude Code 提供当前上下文、窗口上限和预计算百分比，适合实时上下文监控。

## 三、桥接脚本为什么写快照

statusLine 命令只在 Claude Code 进程中接收 JSON。桥接脚本一边输出原有状态栏，一边把最小状态写入 `data/cc-sessions/`，让 Electron 可以通过文件监听获得数据。文件方式不要求桌宠始终运行，也不需要开放本地端口。

## 四、原子写入

先写临时文件，再重命名为正式 JSON，可以避免监听器在写入进行到一半时读取到不完整内容。

## 五、安全降级

无法确定上下文上限或占用率时，应显示“数据不可用”，而不是猜测一个数值。监控功能可以失败，但不能影响 Claude Code 本身。
```

- [ ] **Step 4: Run the complete automated check**

Run:

```powershell
npm test
node --check main.js
node --check preload.js
node --check cc-monitor.js
node --check claude-statusline-bridge.js
node --check renderer/js/app.js
node --check renderer/js/bubble.js
node --check renderer/js/pet.js
node --check renderer/js/detail.js
git diff --check
```

Expected: four success messages from `npm test`; every syntax check exits 0; `git diff --check` prints nothing.

- [ ] **Step 5: Commit workflow and documentation**

```powershell
git add -- package.json docs/notes/07-Claude-Code状态栏数据桥接.md
git commit -m "📝 记录 statusLine 数据桥接"
```

Expected: one local commit containing only `package.json` and the learning note.

---

### Task 5: Configure the local Claude Code statusLine and verify end to end

**Files:**
- Create ignored runtime file: `data/statusline-backup.json`
- Modify user configuration: `C:/Users/lenovo/.claude/settings.json`
- Verify runtime output: `data/cc-sessions/<session-id>.json`

**Interfaces:**
- Consumes: `claude-statusline-bridge.js` and the current user-level `statusLine` object.
- Produces: a live snapshot from DeepSeek and unchanged visible status bar behavior.

- [ ] **Step 1: Explain the external configuration change and receive separate confirmation**

State that this step changes a user-level Claude Code file and may trigger one paid or quota-consuming DeepSeek request during verification. Explain that only `statusLine` changes, the old object is backed up without credentials, and rollback restores exactly that object. Wait for explicit confirmation.

- [ ] **Step 2: Back up only the current statusLine object**

Create the ignored `data/statusline-backup.json` with the current object:

```json
{
    "type": "command",
    "command": "python -c \"import sys,json;d=json.load(sys.stdin);m=d.get('model',{}).get('display_name','?');c=d.get('context_window',{}).get('used_percentage',0);bar='['+'#'*(c//10)+'.'*(10-c//10)+']';print(f'{m} {bar} {c}%')\""
}
```

Verify that `git status --short` does not list this ignored file.

- [ ] **Step 3: Replace only the user statusLine object**

Use `apply_patch` on `C:/Users/lenovo/.claude/settings.json` to replace the existing `statusLine` value with the temporary worktree command:

```json
"statusLine": {
    "type": "command",
    "command": "node \"E:/kaifa/animal/.worktrees/statusline-monitor/claude-statusline-bridge.js\""
}
```

Do not change the `env`, plugin, language, theme, or other settings fields.

- [ ] **Step 4: Validate the configuration without a live API request**

Run:

```powershell
node -e "const fs=require('fs');const p=process.env.USERPROFILE+'/.claude/settings.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));if(!d.statusLine?.command.includes('.worktrees/statusline-monitor/claude-statusline-bridge.js'))process.exit(1);console.log('temporary statusLine config ok')"
git status --short
```

Expected: `temporary statusLine config ok`; neither user settings nor ignored runtime data appears in repository status.

- [ ] **Step 5: Trigger one Claude Code update and inspect the sanitized snapshot**

Open or continue a trusted Claude Code session in `E:/kaifa/animal/.worktrees/statusline-monitor` and send one minimal message such as `回复 OK`.

Expected visible result: the status line still has the form `DeepSeek [#.........] 19%`, with the bar reflecting the current percentage.

Then run:

```powershell
$file = Get-ChildItem -LiteralPath 'E:/kaifa/animal/data/cc-sessions' -Filter '*.json' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$snapshot = Get-Content -Raw -Encoding UTF8 -LiteralPath $file.FullName | ConvertFrom-Json
$snapshot | Select-Object source,sessionId,projectPath,updatedAt
$snapshot.context | Select-Object windowSize,usedPercentage,totalInputTokens,totalOutputTokens
```

Expected: `source` is `claude-code`, `projectPath` is `E:/kaifa/animal/.worktrees/statusline-monitor`, `windowSize` is `1000000`, and no prompt, response, token, or transcript fields exist outside the documented numeric usage fields.

- [ ] **Step 6: Run Electron manual verification**

Run:

```powershell
npm start
```

Manually verify:

1. Startup initially shows only the pet.
2. Double-click opens the detail panel.
3. The DeepSeek context limit displays `1M 上限`.
4. Approximately 199,573 input tokens display approximately `19.96%`, not 100%.
5. A subsequent Claude Code response refreshes the panel without restarting Electron.
6. Closing Electron does not affect Claude Code or its visible status line.

- [ ] **Step 7: Run final fresh verification**

After closing the manual Electron session, run:

```powershell
npm test
node --check main.js
node --check preload.js
node --check cc-monitor.js
node --check claude-statusline-bridge.js
node --check renderer/js/app.js
node --check renderer/js/bubble.js
node --check renderer/js/pet.js
node --check renderer/js/detail.js
git diff --check
git status --short --branch
git log -5 --oneline --decorate
```

Expected: all tests and syntax checks exit 0, `git diff --check` prints nothing, only intended commits are ahead of the remote branch, and runtime files remain absent from Git status.

- [ ] **Step 8: Stop before remote operations**

Summarize the implementation, tests, manual verification, local commits, and any remaining limitation. Do not push or create a pull request. Ask for explicit confirmation before any GitHub remote update.

## Rollback Procedure

If the bridge interferes with Claude Code, use the ignored backup as the source of truth:

1. Read `data/statusline-backup.json`.
2. Use `apply_patch` to replace only `statusLine` in `C:/Users/lenovo/.claude/settings.json` with the backed-up object.
3. Start a new Claude Code interaction and confirm the original Python-rendered status line returns.
4. Keep repository code and tests intact; rollback of user configuration does not require reverting commits.

## Post-Integration Stable Path

After the reviewed `statusline-monitor` branch is locally integrated into `event-bus`, and before deleting the worktree:

1. Use `apply_patch` to change only the statusLine command in `C:/Users/lenovo/.claude/settings.json` to `node \"E:/kaifa/animal/claude-statusline-bridge.js\"`.
2. Parse the settings file with Node and verify that the command contains `E:/kaifa/animal/claude-statusline-bridge.js` and does not contain `.worktrees`.
3. Start one Claude Code interaction from `E:/kaifa/animal` and verify that `E:/kaifa/animal/data/cc-sessions/` receives the new snapshot.
4. Only after those checks pass, remove the temporary worktree through the finishing-branch workflow.
