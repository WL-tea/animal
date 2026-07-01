// CC 监控模块 — 读取 Claude Code 运行数据
// 运行在 Electron 主进程（Node.js 环境），通过 IPC 发送给页面

const fs = require("fs");
const path = require("path");
const os = require("os");

// Claude Code 数据存放的根目录
const CLAUDE_HOME = path.join(os.homedir(), ".claude");

function isBackupFile(filename) {
    return filename.includes(".json.backup");
}

function normalizeProjectPath(projectPath) {
    return projectPath.replace(/\\/g, "/");
}

class CCMonitor {
    constructor(webContents) {
        this.webContents = webContents;   // 用于给页面发消息
        this.projects = [];                // 用户配置的监控项目列表
        this.watcher = null;               // 文件监听器
        this.backupData = {};              // 缓存的最新数据
    }

    // 设置要监控的项目列表
    setProjects(projectPaths) {
        this.projects = projectPaths;
        this.startWatching();
    }

    // 开始监听文件变化
    startWatching() {
        if (this.watcher) return;

        const backupDir = path.join(CLAUDE_HOME, "backups");

        if (!fs.existsSync(backupDir)) {
            console.log("[CC] backup 目录不存在:", backupDir);
            return;
        }

        // 监听 backup 目录的文件变化
        this.watcher = fs.watch(backupDir, (eventType, filename) => {
            if (filename && isBackupFile(filename)) {
                this.readBackupFile(path.join(backupDir, filename));
            }
        });

        console.log("[CC] 开始监听:", backupDir);
    }

    // 读取 backup 文件
    readBackupFile(filepath) {
        try {
            const raw = fs.readFileSync(filepath, "utf-8");
            const data = JSON.parse(raw);
            const projects = data.projects || data;

            // 提取我们关心的项目数据
            const projectStats = {};
            for (const projectPath of this.projects) {
                const normalized = normalizeProjectPath(projectPath);
                const projData = projects[normalized] || projects[projectPath];
                if (projData) {
                    projectStats[normalized] = {
                        lastCost: projData.lastCost || 0,
                        lastTotalInputTokens: projData.lastTotalInputTokens || 0,
                        lastTotalOutputTokens: projData.lastTotalOutputTokens || 0,
                        lastTotalCacheReadInputTokens: projData.lastTotalCacheReadInputTokens || 0,
                        lastModelUsage: projData.lastModelUsage || {},
                        lastAPIDuration: projData.lastAPIDuration || 0,
                        lastDuration: projData.lastDuration || 0,
                        lastSessionMetrics: projData.lastSessionMetrics || null,
                    };
                }
            }

            this.backupData = projectStats;
            this.sendToRenderer();
        } catch (err) {
            console.error("[CC] 读取 backup 文件失败:", err.message);
        }
    }

    // 把数据发送到页面
    sendToRenderer() {
        if (this.webContents && !this.webContents.isDestroyed()) {
            this.webContents.send("cc-update", {
                projects: this.backupData,
                timestamp: Date.now(),
            });
        }
    }

    // 立即刷新一次数据
    refresh() {
        const backupDir = path.join(CLAUDE_HOME, "backups");
        if (!fs.existsSync(backupDir)) return;

        const files = fs.readdirSync(backupDir)
            .filter(isBackupFile)
            .sort()
            .reverse();

        if (files.length > 0) {
            this.readBackupFile(path.join(backupDir, files[0]));
        }
    }

    // 停止监听
    stopWatching() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }
}

module.exports = CCMonitor;
