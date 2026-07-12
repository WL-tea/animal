// 前端主控：保存页面级公共能力，后续逐步承接事件转发和全局状态。
const petApp = {
    events: {},
    ccData: null,
    ccAlertStates: new Map(),

    on(eventName, handler) {
        if (!this.events[eventName]) {
            this.events[eventName] = [];
        }

        this.events[eventName].push(handler);
    },

    emit(eventName, data) {
        const handlers = this.events[eventName] || [];

        handlers.forEach((handler) => {
            handler(data);
        });
    },

    setCCData(data) {
        this.ccData = data;
        this.emit("cc:update", data);
        this.updateCCAlerts(data);
    },

    getCCData() {
        return this.ccData;
    },

    updateCCAlerts(data) {
        const projects = data?.projects;
        if (!projects || typeof projects !== "object") {
            return;
        }

        Object.entries(projects).forEach(([projectPath, project]) => {
            const sessions = Array.isArray(project?.sessions) ? project.sessions : [];

            sessions.forEach((session) => {
                const sessionId = session?.sessionId;
                const usedPercentage = session?.context?.usedPercentage;
                if (!sessionId || !isValidContextPercentage(usedPercentage)) {
                    return;
                }

                const stateKey = `${projectPath}\n${sessionId}`;
                const previousState = this.ccAlertStates.get(stateKey);
                const nextState = getContextAlertState(usedPercentage);
                this.ccAlertStates.set(stateKey, nextState);

                if (!previousState || getAlertLevel(nextState) <= getAlertLevel(previousState)) {
                    return;
                }

                this.emit("bubble:say", createContextAlert(projectPath, usedPercentage, nextState));
            });
        });
    },
};

function isValidContextPercentage(value) {
    return Number.isFinite(value) && value >= 0 && value <= 100;
}

function getContextAlertState(usedPercentage) {
    if (usedPercentage >= 95) {
        return "danger";
    }

    if (usedPercentage >= 80) {
        return "warning";
    }

    return "normal";
}

function getAlertLevel(state) {
    return {
        normal: 0,
        warning: 1,
        danger: 2,
    }[state] ?? -1;
}

function createContextAlert(projectPath, usedPercentage, state) {
    const projectName = projectPath.split(/[\\/]/).filter(Boolean).at(-1) || projectPath;
    const percentage = `${usedPercentage.toFixed(1)}%`;

    if (state === "danger") {
        return {
            message: `${projectName} 的上下文已到 ${percentage}，要爆了！快去处理！`,
            duration: 5000,
        };
    }

    return {
        message: `${projectName} 的上下文已到 ${percentage}，记得及时 compact。`,
        duration: 4000,
    };
}

window.petApp = petApp;

function initCCDataSource() {
    if (!window.ccAPI) {
        return;
    }

    window.ccAPI.onUpdate((data) => {
        petApp.setCCData(data);
    });

    const refreshResult = window.ccAPI.refresh();
    if (refreshResult?.catch) {
        refreshResult.catch((err) => {
            console.error("[CC] refresh failed:", err);
        });
    }
}

initCCDataSource();
