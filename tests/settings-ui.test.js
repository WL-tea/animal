const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    toggle(name, enabled) {
        if (enabled) this.values.add(name);
        else this.values.delete(name);
    }

    contains(name) {
        return this.values.has(name);
    }
}

class FakeElement {
    constructor() {
        this.children = [];
        this.classList = new FakeClassList();
        this.hidden = false;
        this.disabled = false;
        this.textContent = "";
        this.handlers = {};
    }

    append(...children) {
        this.children.push(...children);
    }

    replaceChildren(...children) {
        this.children = children;
    }

    addEventListener(eventName, handler) {
        this.handlers[eventName] = handler;
    }

    setAttribute(name, value) {
        this[name] = value;
    }
}

const elements = {
    "#settings-panel": new FakeElement(),
    "#settings-status": new FakeElement(),
    "#settings-project-list": new FakeElement(),
    "#settings-empty": new FakeElement(),
    "#settings-open": new FakeElement(),
    "#settings-close": new FakeElement(),
    "#settings-add-project": new FakeElement(),
    "#settings-pet-always-on-top": new FakeElement(),
};
elements["#settings-panel"].hidden = true;

let domReadyHandler = null;
const document = {
    addEventListener(eventName, handler) {
        if (eventName === "DOMContentLoaded") domReadyHandler = handler;
    },
    createElement() {
        return new FakeElement();
    },
    querySelector(selector) {
        return elements[selector] || null;
    },
};

const calls = [];
const context = {
    console,
    document,
    window: {
        settingsAPI: {
            getProjects: async () => ({
                ok: true,
                projects: ["E:/work/<unsafe>"],
                projectStatuses: [{ path: "E:/work/<unsafe>", status: "missing" }],
            }),
            chooseAndAddProject: async () => ({
                ok: true,
                canceled: false,
                projects: ["E:/work/<unsafe>", "E:/work/second"],
                projectStatuses: [
                    { path: "E:/work/<unsafe>", status: "missing" },
                    { path: "E:/work/second", status: "available" },
                ],
            }),
            removeProject: async (projectPath) => {
                calls.push(projectPath);
                return {
                    ok: true,
                    projects: ["E:/work/second"],
                    projectStatuses: [{ path: "E:/work/second", status: "available" }],
                };
            },
            getPreferences: async () => ({
                ok: true,
                petAlwaysOnTop: true,
            }),
            setPetAlwaysOnTop: async (enabled) => {
                calls.push({ petAlwaysOnTop: enabled });
                return { ok: true, petAlwaysOnTop: enabled };
            },
        },
    },
};

const settingsJs = fs.readFileSync(
    path.join(__dirname, "..", "renderer", "js", "settings.js"),
    "utf-8",
);

async function run() {
    vm.createContext(context);
    vm.runInContext(settingsJs, context);
    domReadyHandler();

    const showPromise = context.showSettings();
    assert.strictEqual(elements["#settings-add-project"].disabled, true);
    await showPromise;
    assert.strictEqual(elements["#settings-add-project"].disabled, false);
    assert.strictEqual(elements["#settings-panel"].hidden, false);
    assert.strictEqual(elements["#settings-pet-always-on-top"].checked, true);
    assert.strictEqual(elements["#settings-project-list"].children.length, 1);
    assert.strictEqual(elements["#settings-empty"].hidden, true);

    const firstCard = elements["#settings-project-list"].children[0];
    const copy = firstCard.children[0];
    assert.match(firstCard.className, /is-unavailable/);
    assert.strictEqual(copy.children[0].textContent, "<unsafe>");
    assert.strictEqual(copy.children[1].textContent, "E:/work/<unsafe>");
    assert.strictEqual(copy.children[2].textContent, "文件夹已移动或删除");
    assert.strictEqual(firstCard.innerHTML, undefined, "external paths should not use innerHTML");

    context.renderSettingsProjects(
        ["E:/work/file.txt"],
        [{ path: "E:/work/file.txt", status: "not-directory" }],
    );
    const nonDirectoryCopy = elements["#settings-project-list"].children[0].children[0];
    assert.strictEqual(nonDirectoryCopy.children[2].textContent, "该路径现在不是文件夹");

    await context.addProject();
    assert.strictEqual(elements["#settings-project-list"].children.length, 2);
    assert.match(elements["#settings-status"].textContent, /项目已添加/);

    const removeButton = elements["#settings-project-list"].children[0].children[1];
    const removePromise = context.removeProject("E:/work/<unsafe>", removeButton);
    assert.strictEqual(elements["#settings-add-project"].disabled, true);
    await removePromise;
    assert.strictEqual(elements["#settings-add-project"].disabled, false);
    assert.deepStrictEqual(calls, ["E:/work/<unsafe>"]);
    assert.strictEqual(elements["#settings-project-list"].children.length, 1);
    assert.match(elements["#settings-status"].textContent, /项目已移除/);

    context.renderSettingsProjects([]);
    assert.strictEqual(elements["#settings-empty"].hidden, false);

    elements["#settings-pet-always-on-top"].checked = false;
    await elements["#settings-pet-always-on-top"].handlers.change();
    assert.deepStrictEqual(calls, [
        "E:/work/<unsafe>",
        { petAlwaysOnTop: false },
    ]);
    assert.strictEqual(elements["#settings-pet-always-on-top"].checked, false);
    context.hideSettings();
    assert.strictEqual(elements["#settings-panel"].hidden, true);
}

run()
    .then(() => console.log("settings ui ok"))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
