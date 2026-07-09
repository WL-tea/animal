// 详情窗口 — 显示 Claude Code 项目数据

let projectList = [];     // 所有项目数据
let selectedProject = null;  // 当前选中的项目

// 初始化详情窗口
function initDetail() {
    if (!window.ccAPI) {
        renderDetail();
        return;
    }

    // 监听 CC 主进程推送的数据
    window.ccAPI.onUpdate((data) => {
        projectList = Object.entries(data.projects).map(([path, stats]) => ({
            path,
            name: path.split("\\").pop() || path.split("/").pop() || path,
            ...stats,
        }));

        // 默认选中第一个项目
        if (projectList.length > 0 && !selectedProject) {
            selectedProject = projectList[0].path;
        }

        renderDetail();
    });

    window.ccAPI.refresh();
}

// 渲染详情窗口
function renderDetail() {
    const panel = document.querySelector("#detail-panel");
    if (!panel || panel.hidden) return;

    // 渲染左侧项目列表
    renderProjectList();

    // 渲染右侧选中项目详情
    renderProjectDetail();
}

// 渲染项目列表（左侧）
function renderProjectList() {
    const listEl = document.querySelector("#detail-list");
    if (!listEl) return;

    listEl.innerHTML = projectList.map((proj) => {
        const isActive = proj.path === selectedProject;
        const isOnline = proj.lastDuration > 0;
        return `
            <div class="detail-project ${isActive ? "active" : ""}" data-path="${proj.path}">
                <span class="status-dot ${isOnline ? "online" : "offline"}"></span>
                <span class="project-name">${proj.name}</span>
            </div>
        `;
    }).join("");

    // 点击切换选中项目
    listEl.querySelectorAll(".detail-project").forEach((el) => {
        el.addEventListener("click", () => {
            selectedProject = el.dataset.path;
            renderDetail();
        });
    });
}

// 渲染项目详情（右侧）
function renderProjectDetail() {
    const contentEl = document.querySelector("#detail-content");
    if (!contentEl) return;

    const proj = projectList.find((p) => p.path === selectedProject);
    if (!proj) {
        contentEl.innerHTML = `<div class="detail-empty">选择一个项目查看状态</div>`;
        return;
    }

    const rawInputTokens = proj.lastTotalInputTokens || 0;
    const rawOutputTokens = proj.lastTotalOutputTokens || 0;
    const rawCacheTokens = proj.lastTotalCacheReadInputTokens || 0;
    const inputTokens = rawInputTokens.toLocaleString();
    const outputTokens = rawOutputTokens.toLocaleString();
    const cacheTokens = (rawCacheTokens / 1024 / 1024).toFixed(1);

    // 模拟上下文百分比（实际需要从 JSONL 读取）
    const contextPercent = Math.min(100, Math.round((rawInputTokens / 200000) * 100));

    // 模型使用明细
    const modelRows = Object.entries(proj.lastModelUsage || {})
        .map(([model, usage]) => `
            <div class="detail-model-row">
                <span class="model-name">${model}</span>
                <span class="model-tokens">I:${(usage.inputTokens || 0).toLocaleString()} O:${(usage.outputTokens || 0).toLocaleString()}</span>
                <span class="model-cost">$${(usage.costUSD || 0).toFixed(2)}</span>
            </div>
        `).join("");

    contentEl.innerHTML = `
        <div class="detail-header">
            <h2>${proj.name}</h2>
            <span class="status-badge ${proj.lastDuration > 0 ? "online" : "offline"}">
                ${proj.lastDuration > 0 ? "运行中" : "离线"}
            </span>
        </div>

        <div class="detail-section">
            <div class="detail-label">上下文</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width:${contextPercent}%"></div>
            </div>
            <div class="detail-stats">
                <span>${contextPercent}%</span>
                <span>200K 上限</span>
            </div>
        </div>

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

// 打开详情窗口
function showDetail() {
    const panel = document.querySelector("#detail-panel");
    if (!panel) return;
    panel.hidden = false;
    document.body.classList.add("show-detail");
    // 缩小宠物腾出空间
    document.querySelector("#pet").classList.add("with-detail");
    renderDetail();
}

// 关闭详情窗口
function hideDetail() {
    const panel = document.querySelector("#detail-panel");
    if (!panel) return;
    panel.hidden = true;
    document.body.classList.remove("show-detail");
    document.querySelector("#pet").classList.remove("with-detail");
}

// 页面加载完成后初始化
document.addEventListener("DOMContentLoaded", () => {
    initDetail();

    window.petApp?.on("detail:open", showDetail);

    // 关闭按钮
    document.querySelector("#detail-close")?.addEventListener("click", hideDetail);
});
