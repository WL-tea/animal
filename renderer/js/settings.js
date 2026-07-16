const settingsState = {
    projects: [],
    busy: false,
};

function getSettingsProjectName(projectPath) {
    return projectPath.split(/[\\/]/).filter(Boolean).at(-1) || projectPath;
}

function getProjectStatusMessage(status) {
    return {
        missing: "文件夹已移动或删除",
        "not-directory": "该路径现在不是文件夹",
        unreadable: "无法读取这个文件夹",
    }[status] || "";
}

function setSettingsStatus(message = "", isError = false) {
    const status = document.querySelector("#settings-status");
    if (!status) return;

    status.textContent = message;
    status.classList.toggle("is-error", isError);
}

function setSettingsBusy(isBusy) {
    settingsState.busy = isBusy;
    const addButton = document.querySelector("#settings-add-project");
    if (addButton) addButton.disabled = isBusy;
}

function createProjectCard(project) {
    const { path: projectPath, status } = project;
    const statusMessage = getProjectStatusMessage(status);
    const card = document.createElement("article");
    card.className = `settings-project-card${statusMessage ? " is-unavailable" : ""}`;

    const copy = document.createElement("div");
    copy.className = "settings-project-copy";

    const name = document.createElement("strong");
    name.className = "settings-project-name";
    name.textContent = getSettingsProjectName(projectPath);

    const pathText = document.createElement("span");
    pathText.className = "settings-project-path";
    pathText.textContent = projectPath;
    pathText.title = projectPath;

    const health = document.createElement("span");
    health.className = "settings-project-health";
    health.textContent = statusMessage;
    health.hidden = !statusMessage;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "settings-remove-project";
    removeButton.textContent = "移除";
    removeButton.setAttribute("aria-label", `移除项目 ${getSettingsProjectName(projectPath)}`);
    removeButton.addEventListener("click", () => removeProject(projectPath, removeButton));

    copy.append(name, pathText, health);
    card.append(copy, removeButton);
    return card;
}

function renderSettingsProjects(projects, projectStatuses = []) {
    const statusByPath = new Map(projectStatuses.map((item) => [item.path, item.status]));
    settingsState.projects = (Array.isArray(projects) ? projects : []).map((projectPath) => ({
        path: projectPath,
        status: statusByPath.get(projectPath) || "available",
    }));
    const list = document.querySelector("#settings-project-list");
    const empty = document.querySelector("#settings-empty");
    if (!list || !empty) return;

    list.replaceChildren(...settingsState.projects.map(createProjectCard));
    empty.hidden = settingsState.projects.length > 0;
}

function renderSettingsResult(result) {
    renderSettingsProjects(result?.projects, result?.projectStatuses);
}

async function loadSettingsProjects() {
    if (!window.settingsAPI) {
        setSettingsStatus("设置功能不可用，请重新启动应用。", true);
        renderSettingsProjects([]);
        return;
    }

    setSettingsBusy(true);
    setSettingsStatus("正在读取项目列表…");
    try {
        const result = await window.settingsAPI.getProjects();
        renderSettingsResult(result);
        setSettingsStatus(result?.ok ? "" : result?.error?.message || "项目列表读取失败。", !result?.ok);
    } catch (error) {
        console.error("[settings] failed to load projects:", error);
        setSettingsStatus("项目列表读取失败，请稍后重试。", true);
        renderSettingsProjects([]);
    } finally {
        setSettingsBusy(false);
    }
}

async function loadPreferences() {
    const topmostToggle = document.querySelector("#settings-pet-always-on-top");
    if (!topmostToggle || !window.settingsAPI?.getPreferences) return;

    try {
        const result = await window.settingsAPI.getPreferences();
        topmostToggle.checked = result?.petAlwaysOnTop !== false;
        if (!result?.ok) {
            setSettingsStatus(result?.error?.message || "窗口设置读取失败。", true);
        }
    } catch (error) {
        console.error("[settings] failed to load preferences:", error);
        topmostToggle.checked = true;
        setSettingsStatus("窗口设置读取失败，请稍后重试。", true);
    }
}

async function addProject() {
    if (settingsState.busy || !window.settingsAPI) return;

    setSettingsBusy(true);
    setSettingsStatus("正在选择项目文件夹…");
    try {
        const result = await window.settingsAPI.chooseAndAddProject();
        renderSettingsResult(result);

        if (!result?.ok) {
            setSettingsStatus(result?.error?.message || "项目添加失败。", true);
        } else if (result.canceled) {
            setSettingsStatus("");
        } else {
            setSettingsStatus("项目已添加，监控数据正在刷新。");
        }
    } catch (error) {
        console.error("[settings] failed to add project:", error);
        setSettingsStatus("项目添加失败，请稍后重试。", true);
    } finally {
        setSettingsBusy(false);
    }
}

async function removeProject(projectPath, button) {
    if (settingsState.busy || !window.settingsAPI) return;

    setSettingsBusy(true);
    button.disabled = true;
    setSettingsStatus("正在移除项目…");
    try {
        const result = await window.settingsAPI.removeProject(projectPath);
        renderSettingsResult(result);
        setSettingsStatus(
            result?.ok ? "项目已移除。" : result?.error?.message || "项目移除失败。",
            !result?.ok,
        );
    } catch (error) {
        console.error("[settings] failed to remove project:", error);
        setSettingsStatus("项目移除失败，请稍后重试。", true);
        button.disabled = false;
    } finally {
        setSettingsBusy(false);
    }
}

async function showSettings() {
    const panel = document.querySelector("#settings-panel");
    if (!panel) return;

    panel.hidden = false;
    await Promise.all([loadSettingsProjects(), loadPreferences()]);
}

function hideSettings() {
    const panel = document.querySelector("#settings-panel");
    if (panel) panel.hidden = true;
}

async function updatePetAlwaysOnTop() {
    const topmostToggle = document.querySelector("#settings-pet-always-on-top");
    if (!topmostToggle || !window.settingsAPI?.setPetAlwaysOnTop) return;

    const requestedValue = topmostToggle.checked;
    topmostToggle.disabled = true;
    setSettingsStatus("正在更新窗口设置…");
    try {
        const result = await window.settingsAPI.setPetAlwaysOnTop(requestedValue);
        topmostToggle.checked = result?.petAlwaysOnTop !== false;
        setSettingsStatus(
            result?.ok ? "窗口设置已更新。" : result?.error?.message || "窗口设置更新失败。",
            !result?.ok,
        );
    } catch (error) {
        console.error("[settings] failed to update topmost preference:", error);
        topmostToggle.checked = !requestedValue;
        setSettingsStatus("窗口设置更新失败，请稍后重试。", true);
    } finally {
        topmostToggle.disabled = false;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.windowAPI?.onOpenSettings?.(showSettings);
    document.querySelector("#settings-open")?.addEventListener("click", showSettings);
    document.querySelector("#settings-close")?.addEventListener("click", hideSettings);
    document.querySelector("#settings-add-project")?.addEventListener("click", addProject);
    document.querySelector("#settings-pet-always-on-top")?.addEventListener(
        "change",
        updatePetAlwaysOnTop,
    );
});
