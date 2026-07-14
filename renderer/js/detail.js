// Detail panel: render Claude Code project data from the app event bus.

let projectList = [];
let selectedProject = null;

function getProjectName(projectPath) {
    return projectPath.split("\\").pop() || projectPath.split("/").pop() || projectPath;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;",
    })[character]);
}

function updateProjectList(data) {
    projectList = Object.entries(data?.projects || {}).map(([projectPath, stats]) => ({
        path: projectPath,
        name: getProjectName(projectPath),
        ...stats,
    }));

    if (projectList.length === 0) {
        selectedProject = null;
    }

    if (projectList.length > 0 && !projectList.some((proj) => proj.path === selectedProject)) {
        selectedProject = projectList[0].path;
    }

    renderDetail();
}

function initDetail() {
    if (!window.petApp) {
        renderDetail();
        return;
    }

    window.petApp.on("cc:update", updateProjectList);
    updateProjectList(window.petApp.getCCData?.());
}

function renderDetail() {
    const panel = document.querySelector("#detail-panel");
    if (!panel || panel.hidden) return;

    renderProjectList();
    renderProjectDetail();
}

function renderProjectList() {
    const listEl = document.querySelector("#detail-list");
    if (!listEl) return;

    listEl.innerHTML = projectList.map((proj, index) => {
        const isActive = proj.path === selectedProject;
        const isOnline = proj.lastDuration > 0;

        return `
            <div class="detail-project ${isActive ? "active" : ""}" data-index="${index}">
                <span class="status-dot ${isOnline ? "online" : "offline"}"></span>
                <span class="project-name">${escapeHtml(proj.name)}</span>
            </div>
        `;
    }).join("");

    listEl.querySelectorAll(".detail-project").forEach((el) => {
        el.addEventListener("click", () => {
            const project = projectList[Number(el.dataset.index)];
            if (!project) return;

            selectedProject = project.path;
            renderDetail();
        });
    });
}

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

function renderProjectDetail() {
    const contentEl = document.querySelector("#detail-content");
    if (!contentEl) return;

    const proj = projectList.find((p) => p.path === selectedProject);
    if (!proj) {
        contentEl.innerHTML = `
            <div class="detail-empty">
                <strong>还没有监控项目</strong>
                <span>打开左下角“管理项目”，添加一个项目文件夹。</span>
            </div>
        `;
        return;
    }

    const rawInputTokens = proj.lastTotalInputTokens || 0;
    const rawOutputTokens = proj.lastTotalOutputTokens || 0;
    const rawCacheTokens = proj.lastTotalCacheReadInputTokens || 0;
    const inputTokens = rawInputTokens.toLocaleString();
    const outputTokens = rawOutputTokens.toLocaleString();
    const cacheTokens = (rawCacheTokens / 1024 / 1024).toFixed(1);

    const modelRows = Object.entries(proj.lastModelUsage || {})
        .map(([model, usage]) => `
            <div class="detail-model-row">
                <span class="model-name">${escapeHtml(model)}</span>
                <span class="model-tokens">I:${(usage.inputTokens || 0).toLocaleString()} O:${(usage.outputTokens || 0).toLocaleString()}</span>
                <span class="model-cost">$${(usage.costUSD || 0).toFixed(2)}</span>
            </div>
        `).join("");

    contentEl.innerHTML = `
        <div class="detail-header">
            <h2>${escapeHtml(proj.name)}</h2>
            <span class="status-badge ${proj.lastDuration > 0 ? "online" : "offline"}">
                ${proj.lastDuration > 0 ? "运行中" : "离线"}
            </span>
        </div>

        ${renderContextSection(proj)}

        <div class="detail-section">
            <div class="detail-label">Token 统计</div>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="item-value">${inputTokens}</span>
                    <span class="item-label">输入</span>
                </div>
                <div class="detail-item">
                    <span class="item-value">${outputTokens}</span>
                    <span class="item-label">输出</span>
                </div>
                <div class="detail-item">
                    <span class="item-value">${cacheTokens}M</span>
                    <span class="item-label">缓存读取</span>
                </div>
                <div class="detail-item">
                    <span class="item-value">$${proj.lastCost?.toFixed(2) || "0.00"}</span>
                    <span class="item-label">总花费</span>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-label">模型使用明细</div>
            ${modelRows || '<div class="detail-empty">暂无数据</div>'}
        </div>
    `;
}

function showDetail() {
    const panel = document.querySelector("#detail-panel");
    if (!panel) return;

    panel.hidden = false;
    document.body.classList.add("show-detail");
    document.querySelector("#pet")?.classList.add("with-detail");
    renderDetail();
}

function hideDetail() {
    const panel = document.querySelector("#detail-panel");
    if (!panel) return;

    panel.hidden = true;
    document.body.classList.remove("show-detail");
    document.querySelector("#pet")?.classList.remove("with-detail");
}

document.addEventListener("DOMContentLoaded", () => {
    initDetail();

    window.petApp?.on("detail:open", showDetail);
    document.querySelector("#detail-close")?.addEventListener("click", hideDetail);
});
