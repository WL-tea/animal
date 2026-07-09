// 前端主控：保存页面级公共能力，后续逐步承接事件转发和全局状态。
const petApp = {
    events: {},
    ccData: null,

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
    },

    getCCData() {
        return this.ccData;
    },
};

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
