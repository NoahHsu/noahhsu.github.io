let lastTime=0;
const desiredFPS = 10;
let isScrolling=false;

function toggle() {
    isScrolling = !isScrolling;
}

function autoScroll() {
    console.log("trigger autoScroll:" + isScrolling);
    let scrollStepInput = document.getElementById('scrollStepInput');
    let scrollStep = parseFloat(scrollStepInput.value);

    let currentTime = performance.now();
    const deltaTime = currentTime - lastTime;
    if ((deltaTime >= 1000 / desiredFPS) && scrollStep > 0) {

        $('html, body').scrollTop($(window).scrollTop() + (scrollStep));
        lastTime = currentTime;
    }

    if (isScrolling) {
        requestAnimationFrame(autoScroll);
    }
}

