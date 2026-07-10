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
    if (!SESSION_ID_PATTERN.test(snapshot?.sessionId || "")) {
        throw new Error("Invalid session ID");
    }

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
