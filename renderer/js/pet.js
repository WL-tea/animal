const pet = document.querySelector("#pet");
const bubble = document.querySelector("#bubble");

const state = {
    x: 140,
    y: 240,
    vx: 0.45,
    vy: 0.25,
    dragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    bubbleTimer: null,
};

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function bounds() {
    return {
        maxX: Math.max(0, window.innerWidth - pet.offsetWidth),
        maxY: Math.max(0, window.innerHeight - pet.offsetHeight),
    };
}

function renderPet() {
    pet.style.left = `${state.x}px`;
    pet.style.top = `${state.y}px`;
    renderBubble();
}

function renderBubble() {
    if (bubble.hidden) {
        return;
    }

    bubble.style.left = `${clamp(state.x + 10, 8, window.innerWidth - bubble.offsetWidth - 8)}px`;
    bubble.style.top = `${Math.max(8, state.y - bubble.offsetHeight - 12)}px`;
}

function say(message, duration = 1800) {
    bubble.textContent = message;
    bubble.hidden = false;
    renderBubble();

    clearTimeout(state.bubbleTimer);
    state.bubbleTimer = setTimeout(() => {
        bubble.hidden = true;
    }, duration);
}

function walk() {
    if (!state.dragging) {
        const limit = bounds();
        state.x += state.vx;
        state.y += state.vy;

        if (state.x <= 0 || state.x >= limit.maxX) {
            state.vx *= -1;
        }

        if (state.y <= 0 || state.y >= limit.maxY) {
            state.vy *= -1;
        }

        state.x = clamp(state.x, 0, limit.maxX);
        state.y = clamp(state.y, 0, limit.maxY);
        pet.classList.add("is-walking");
        renderPet();
    }

    requestAnimationFrame(walk);
}

pet.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    state.dragOffsetX = event.clientX - state.x;
    state.dragOffsetY = event.clientY - state.y;
    pet.setPointerCapture(event.pointerId);
    pet.classList.add("is-dragging");
    pet.classList.remove("is-walking");
});

pet.addEventListener("pointermove", (event) => {
    if (!state.dragging) {
        return;
    }

    const limit = bounds();
    state.x = clamp(event.clientX - state.dragOffsetX, 0, limit.maxX);
    state.y = clamp(event.clientY - state.dragOffsetY, 0, limit.maxY);
    renderPet();
});

pet.addEventListener("pointerup", (event) => {
    state.dragging = false;
    pet.releasePointerCapture(event.pointerId);
    pet.classList.remove("is-dragging");
    say("我在这里。");
});

pet.addEventListener("dblclick", () => {
    if (typeof showDetail === "function") {
        showDetail();
    } else {
        say("详情窗口加载中...", 1200);
    }
});

window.addEventListener("resize", () => {
    const limit = bounds();
    state.x = clamp(state.x, 0, limit.maxX);
    state.y = clamp(state.y, 0, limit.maxY);
    renderPet();
});

renderPet();
say("宠物已加载");
requestAnimationFrame(walk);
