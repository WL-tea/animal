// CC 监控模块 — 读取 Claude Code 运行数据
// 运行在 Electron 主进程（Node.js 环境），通过 IPC 发送给页面

const fs = require("fs");
const path = require("path");
const os = require("os");

// Claude Code 数据存放的根目录
const CLAUDE_HOME = path.join(os.homedir(), ".claude");
const STATUS_SNAPSHOT_VERSION = 1;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isBackupFile(filename) {
    return filename.includes(".json.backup");
}

function normalizeProjectPath(projectPath) {
    return projectPath.replace(/\\/g, "/");
}

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function toNonNegativeFiniteNumber(value) {
    return isFiniteNumber(value) && value >= 0 ? value : 0;
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeModelUsage(modelUsage) {
    if (!isPlainObject(modelUsage)) {
        return {};
    }

    return Object.fromEntries(Object.entries(modelUsage)
        .filter(([, usage]) => isPlainObject(usage))
        .map(([model, usage]) => [model, {
            inputTokens: toNonNegativeFiniteNumber(usage.inputTokens),
            outputTokens: toNonNegativeFiniteNumber(usage.outputTokens),
            costUSD: toNonNegativeFiniteNumber(usage.costUSD),
        }]));
}

function sanitizeBackupProject(project) {
    const safeProject = isPlainObject(project) ? project : {};

    return {
        lastCost: toNonNegativeFiniteNumber(safeProject.lastCost),
        lastTotalInputTokens: toNonNegativeFiniteNumber(safeProject.lastTotalInputTokens),
        lastTotalOutputTokens: toNonNegativeFiniteNumber(safeProject.lastTotalOutputTokens),
        lastTotalCacheReadInputTokens: toNonNegativeFiniteNumber(safeProject.lastTotalCacheReadInputTokens),
        lastModelUsage: sanitizeModelUsage(safeProject.lastModelUsage),
        lastAPIDuration: toNonNegativeFiniteNumber(safeProject.lastAPIDuration),
        lastDuration: toNonNegativeFiniteNumber(safeProject.lastDuration),
        lastSessionMetrics: isPlainObject(safeProject.lastSessionMetrics)
            ? safeProject.lastSessionMetrics
            : null,
    };
}

function isValidContext(context) {
    return context === null || (
        isFiniteNumber(context?.windowSize)
        && context.windowSize > 0
        && isFiniteNumber(context?.usedPercentage)
        && context.usedPercentage >= 0
        && context.usedPercentage <= 100
        && (
            context.remainingPercentage === null
            || (
                isFiniteNumber(context.remainingPercentage)
                && context.remainingPercentage >= 0
                && context.remainingPercentage <= 100
            )
        )
        && isFiniteNumber(context.totalInputTokens)
        && context.totalInputTokens >= 0
        && isFiniteNumber(context.totalOutputTokens)
        && context.totalOutputTokens >= 0
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

class CCMonitor {
    constructor(webContents, options = {}) {
        this.webContents = webContents;   // 用于给页面发消息
        this.projects = [];               // 用户配置的监控项目列表
        this.backupWatcher = null;
        this.snapshotWatcher = null;
        this.backupData = {};             // 缓存的最新 backup 数据
        this.sessionSnapshots = new Map();
        this.snapshotAvailable = false;
        this.snapshotDir = options.snapshotDir || path.join(__dirname, "data", "cc-sessions");
    }

    // 设置要监控的项目列表
    setProjects(projectPaths) {
        this.projects = projectPaths;
        this.startWatching();
    }

    // 分别启动 backup 和 statusLine 快照监听
    startWatching() {
        this.startBackupWatching();
        this.startSnapshotWatching();
    }

    startBackupWatching() {
        if (this.backupWatcher) return;

        const backupDir = path.join(CLAUDE_HOME, "backups");
        if (!fs.existsSync(backupDir)) {
            this.backupData = {};
            return;
        }

        try {
            const watcher = fs.watch(backupDir, (_eventType, filename) => {
                if (filename && isBackupFile(filename)) {
                    this.readBackupFile(path.join(backupDir, filename));
                }
            });
            this.backupWatcher = watcher;
            watcher.on("error", (err) => {
                if (this.backupWatcher !== watcher) return;

                console.error("[CC] backup 监听失败:", err.message);
                watcher.close();
                this.backupWatcher = null;
                this.backupData = {};
                this.sendToRenderer();
            });
        } catch (err) {
            console.error("[CC] 启动 backup 监听失败:", err.message);
            this.backupWatcher?.close();
            this.backupWatcher = null;
            this.backupData = {};
            this.sendToRenderer();
        }
    }

    startSnapshotWatching() {
        if (this.snapshotWatcher) return;

        try {
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

                if (this.readSnapshotFile(filepath)) {
                    this.snapshotAvailable = true;
                    this.sendToRenderer();
                }
            });
            this.snapshotWatcher.on("error", (err) => {
                console.error("[CC] statusLine 快照监听失败:", err.message);
                this.snapshotWatcher?.close();
                this.snapshotWatcher = null;
                this.snapshotAvailable = false;
                this.sendToRenderer();
            });
        } catch (err) {
            console.error("[CC] 启动 statusLine 快照监听失败:", err.message);
            this.snapshotWatcher?.close();
            this.snapshotWatcher = null;
            this.snapshotAvailable = false;
            this.sendToRenderer();
        }
    }

    readSnapshotFile(filepath) {
        try {
            const snapshot = JSON.parse(fs.readFileSync(filepath, "utf-8"));
            if (!isValidStatusSnapshot(snapshot)) return false;
            if (path.basename(filepath) !== `${snapshot.sessionId}.json`) return false;

            this.sessionSnapshots.set(path.basename(filepath), snapshot);
            this.sendToRenderer();
            return true;
        } catch (err) {
            console.error("[CC] 读取 statusLine 快照失败:", err.message);
            return false;
        }
    }

    refreshSnapshots() {
        try {
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

            this.snapshotAvailable = true;
        } catch (err) {
            console.error("[CC] 刷新 statusLine 快照失败:", err.message);
            this.snapshotAvailable = false;
        }

        this.sendToRenderer();
    }

    // 读取 backup 文件
    readBackupFile(filepath) {
        try {
            const raw = fs.readFileSync(filepath, "utf-8");
            const data = JSON.parse(raw);
            const projects = isPlainObject(data?.projects) ? data.projects : data;
            // 提取我们关心的项目数据
            const projectStats = {};

            for (const projectPath of this.projects) {
                const normalized = normalizeProjectPath(projectPath);
                const projData = projects[normalized] || projects[projectPath];
                if (projData) {
                    projectStats[normalized] = sanitizeBackupProject(projData);
                }
            }

            this.backupData = projectStats;
            this.sendToRenderer();
            return true;
        } catch (err) {
            console.error("[CC] 读取 backup 文件失败:", err.message);
            return false;
        }
    }

    refreshBackupData() {
        const backupDir = path.join(CLAUDE_HOME, "backups");

        try {
            if (!fs.existsSync(backupDir)) {
                this.backupData = {};
                return;
            }

            const files = fs.readdirSync(backupDir)
                .filter(isBackupFile)
                .sort()
                .reverse();

            if (files.length === 0) {
                this.backupData = {};
                return;
            }

            this.readBackupFile(path.join(backupDir, files[0]));
        } catch (err) {
            console.error("[CC] 刷新 backup 数据失败:", err.message);
            this.backupData = {};
        }
    }

    // 把合并后的数据发送到页面
    sendToRenderer() {
        if (this.webContents && !this.webContents.isDestroyed()) {
            const projects = mergeProjectData(
                this.projects,
                this.backupData,
                this.snapshotAvailable ? Array.from(this.sessionSnapshots.values()) : [],
            );

            this.webContents.send("cc-update", {
                projects,
                timestamp: Date.now(),
            });
        }
    }

    // 立即刷新一次 backup 和快照数据
    refresh() {
        this.refreshBackupData();
        if (!this.backupWatcher) {
            this.startBackupWatching();
        }

        if (this.snapshotWatcher) {
            this.refreshSnapshots();
        } else {
            this.startSnapshotWatching();
        }
    }

    // 停止监听
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
}

module.exports = CCMonitor;
module.exports.isValidStatusSnapshot = isValidStatusSnapshot;
module.exports.mergeProjectData = mergeProjectData;
