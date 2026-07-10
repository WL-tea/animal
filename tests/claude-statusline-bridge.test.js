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
