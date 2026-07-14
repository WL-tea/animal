// IPC 桥接 — 安全暴露主进程能力给页面
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ccAPI", {
    // 请求刷新数据（页面 → 主进程）
    refresh: () => ipcRenderer.invoke("cc-refresh"),

    // 监听主进程推送的数据（主进程 → 页面）
    onUpdate: (callback) => {
        ipcRenderer.on("cc-update", (_event, data) => callback(data));
    },
});

contextBridge.exposeInMainWorld("settingsAPI", {
    getProjects: () => ipcRenderer.invoke("settings:get-projects"),
    chooseAndAddProject: () => ipcRenderer.invoke("settings:add-project"),
    removeProject: (projectPath) => ipcRenderer.invoke("settings:remove-project", projectPath),
});
