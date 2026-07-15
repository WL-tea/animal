const fs = require("fs");
const path = require("path");

const SETTINGS_VERSION = 2;

function createDefaultSettings() {
    return {
        version: SETTINGS_VERSION,
        projects: [],
        petAlwaysOnTop: true,
    };
}

function normalizeProjectPaths(projects) {
    if (!Array.isArray(projects)) {
        return [];
    }

    const normalizedProjects = [];
    const seenPaths = new Set();

    projects.forEach((projectPath) => {
        if (typeof projectPath !== "string" || projectPath.trim() === "") {
            return;
        }

        const normalizedPath = path.resolve(projectPath.trim());
        const comparisonKey = process.platform === "win32"
            ? normalizedPath.toLowerCase()
            : normalizedPath;

        if (seenPaths.has(comparisonKey)) {
            return;
        }

        seenPaths.add(comparisonKey);
        normalizedProjects.push(normalizedPath);
    });

    return normalizedProjects;
}

function sanitizeSettings(settings) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
        return createDefaultSettings();
    }

    return {
        version: SETTINGS_VERSION,
        projects: normalizeProjectPaths(settings.projects),
        petAlwaysOnTop: typeof settings.petAlwaysOnTop === "boolean"
            ? settings.petAlwaysOnTop
            : true,
    };
}

function loadSettings(settingsPath) {
    try {
        const contents = fs.readFileSync(settingsPath, "utf-8");
        return sanitizeSettings(JSON.parse(contents));
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("[settings] failed to read settings:", error);
        }

        return createDefaultSettings();
    }
}

function saveSettings(settingsPath, settings) {
    const sanitizedSettings = sanitizeSettings(settings);
    const settingsDirectory = path.dirname(settingsPath);
    const temporaryPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;

    fs.mkdirSync(settingsDirectory, { recursive: true });

    try {
        fs.writeFileSync(temporaryPath, `${JSON.stringify(sanitizedSettings, null, 2)}\n`, "utf-8");
        fs.renameSync(temporaryPath, settingsPath);
    } catch (error) {
        try {
            fs.unlinkSync(temporaryPath);
        } catch (cleanupError) {
            if (cleanupError.code !== "ENOENT") {
                console.error("[settings] failed to clean temporary settings:", cleanupError);
            }
        }

        throw error;
    }

    return sanitizedSettings;
}

module.exports = {
    SETTINGS_VERSION,
    createDefaultSettings,
    loadSettings,
    normalizeProjectPaths,
    saveSettings,
    sanitizeSettings,
};
