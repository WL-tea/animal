const bubble = document.querySelector("#bubble");

const bubbleState = {
    petX: 0,
    petY: 0,
    timer: null,
};

function clampBubble(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function renderBubble() {
    if (!bubble || bubble.hidden) {
        return;
    }

    bubble.style.left = `${clampBubble(bubbleState.petX + 10, 8, window.innerWidth - bubble.offsetWidth - 8)}px`;
    bubble.style.top = `${Math.max(8, bubbleState.petY - bubble.offsetHeight - 12)}px`;
}

function showBubble(data) {
    if (!bubble) {
        return;
    }

    const message = data?.message || "";
    const duration = data?.duration || 1800;

    bubble.textContent = message;
    bubble.hidden = false;
    renderBubble();

    clearTimeout(bubbleState.timer);
    bubbleState.timer = setTimeout(() => {
        bubble.hidden = true;
    }, duration);
}

window.petApp?.on("pet:moved", (position) => {
    bubbleState.petX = position.x;
    bubbleState.petY = position.y;
    renderBubble();
});

window.petApp?.on("bubble:say", showBubble);

window.addEventListener("resize", renderBubble);
