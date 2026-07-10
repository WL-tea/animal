const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const detailJs = fs.readFileSync(
    path.join(__dirname, "..", "renderer", "js", "detail.js"),
    "utf-8",
);

const panel = { hidden: true };
const content = { innerHTML: "" };
const list = {
    innerHTML: "",
    querySelectorAll() {
        return [];
    },
};
const document = {
    addEventListener() {},
    querySelector(selector) {
        if (selector === "#detail-panel") return panel;
        if (selector === "#detail-content") return content;
        if (selector === "#detail-list") return list;
        return null;
    },
};
const context = {
    console,
    document,
    window: {
        petApp: {
            getCCData() {
                return null;
            },
            on() {},
        },
    },
};

vm.createContext(context);
vm.runInContext(detailJs, context);

context.updateProjectList({
    projects: {
        "E:/kaifa/animal": {
            contextWindowSize: 1000000,
            contextUsedPercentage: 19.9573,
            contextTotalInputTokens: 199573,
            contextTotalOutputTokens: 23,
        },
    },
});
context.renderProjectDetail();

assert.match(content.innerHTML, /19\.96%/);
assert.match(content.innerHTML, /1M 上限/);
assert.doesNotMatch(content.innerHTML, /200K 上限/);

context.updateProjectList({
    projects: {
        "E:/kaifa/animal": {
            contextWindowSize: null,
            contextUsedPercentage: null,
        },
    },
});
context.renderProjectDetail();

assert.match(content.innerHTML, /上下文数据不可用/);
assert.doesNotMatch(content.innerHTML, /0%/);

console.log("detail context rendering ok");
