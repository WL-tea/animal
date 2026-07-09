// 前端主控：保存页面级公共能力，后续逐步承接事件转发和全局状态。
const petApp = {
    events: {},

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
};

window.petApp = petApp;
