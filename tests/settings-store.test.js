const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
    loadSettings,
    normalizeProjectPaths,
    saveSettings,
    sanitizeSettings,
} = require("../settings-store");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "animal-settings-"));
const settingsPath = path.join(tempRoot, "nested", "settings.json");

try {
    const firstProject = path.join(tempRoot, "project-one");
    const secondProject = path.join(tempRoot, "project-two");
    const duplicateFirstProject = process.platform === "win32"
        ? firstProject.toUpperCase()
        : firstProject;

    assert.deepStrictEqual(normalizeProjectPaths([
        `  ${firstProject}  `,
        duplicateFirstProject,
        secondProject,
        "",
        null,
    ]), [path.resolve(firstProject), path.resolve(secondProject)]);

    assert.deepStrictEqual(sanitizeSettings(null), {
        version: 2,
        projects: [],
        petAlwaysOnTop: true,
    });
    assert.deepStrictEqual(sanitizeSettings({ projects: "not-an-array" }), {
        version: 2,
        projects: [],
        petAlwaysOnTop: true,
    });

    assert.deepStrictEqual(sanitizeSettings({
        version: 1,
        projects: [firstProject],
        petAlwaysOnTop: false,
    }), {
        version: 2,
        projects: [path.resolve(firstProject)],
        petAlwaysOnTop: false,
    });

    const savedSettings = saveSettings(settingsPath, {
        version: 99,
        projects: [firstProject, firstProject, secondProject],
        ignoredFutureField: true,
    });

    assert.deepStrictEqual(savedSettings, {
        version: 2,
        projects: [path.resolve(firstProject), path.resolve(secondProject)],
        petAlwaysOnTop: true,
    });
    assert.deepStrictEqual(loadSettings(settingsPath), savedSettings);

    const replacedSettings = saveSettings(settingsPath, {
        projects: [secondProject],
        petAlwaysOnTop: false,
    });
    assert.deepStrictEqual(loadSettings(settingsPath), replacedSettings);
    assert.deepStrictEqual(replacedSettings.projects, [path.resolve(secondProject)]);
    assert.strictEqual(replacedSettings.petAlwaysOnTop, false);

    assert.deepStrictEqual(
        fs.readdirSync(path.dirname(settingsPath)),
        ["settings.json"],
        "atomic save should not leave a temporary file behind",
    );

    fs.writeFileSync(settingsPath, "{broken", "utf-8");
    const originalConsoleError = console.error;
    const loggedErrors = [];
    try {
        console.error = (...args) => loggedErrors.push(args);
        assert.deepStrictEqual(loadSettings(settingsPath), {
            version: 2,
            projects: [],
            petAlwaysOnTop: true,
        });
    } finally {
        console.error = originalConsoleError;
    }
    assert.strictEqual(loggedErrors.length, 1);
    assert.match(loggedErrors[0][0], /failed to read settings/);

    fs.rmSync(settingsPath);
    assert.deepStrictEqual(loadSettings(settingsPath), {
        version: 2,
        projects: [],
        petAlwaysOnTop: true,
    });
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("settings store ok");
