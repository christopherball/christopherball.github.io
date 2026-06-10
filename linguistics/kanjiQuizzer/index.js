let input = "";
const word = document.getElementById("word");
const layoutContainer = document.getElementById("layout-container");
let completedCount = 0;
let cycledCount = 0;
const totalSteps = 4;

function isKanji(ch) {
    return /\p{Script=Han}/u.test(ch);
}

function assignInput() {
    const body = document.getElementsByTagName("body")[0];
    const params = new URLSearchParams(window.location.search);
    const i = params.get("input");
    const title = document.createElement("h1");
    const inp = document.createElement("input");
    const pasteBtn = document.createElement("button");
    const studyBtn = document.createElement("button");
    const license = document.createElement("a");

    if (i) {
        input = i;
        document.getElementById("progress-container").style.display = "block";
        render();
    } else {
        title.textContent = "Kanji Quizzer";
        layoutContainer.appendChild(title);
        inp.id = "input-field";
        inp.type = "text";
        inp.placeholder = "漢字・言葉";
        inp.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                studyBtn.click();
            }
        });
        layoutContainer.appendChild(inp);

        pasteBtn.id = "paste-button";
        pasteBtn.textContent = "Paste";
        pasteBtn.addEventListener("click", async () => {
            try {
                const text = await navigator.clipboard.readText();
                const inputField = document.getElementById("input-field");
                inputField.value = text;
                studyBtn.click();
            } catch (err) {
                console.error("Failed to read clipboard contents: ", err);
                alert("Please allow clipboard permissions when prompted.");
            }
        });
        layoutContainer.appendChild(pasteBtn);

        studyBtn.id = "study-button";
        studyBtn.textContent = "Study";
        studyBtn.addEventListener("click", () => {
            layoutContainer.removeChild(title);
            input = inp.value;
            layoutContainer.removeChild(inp);
            layoutContainer.removeChild(pasteBtn);
            layoutContainer.removeChild(studyBtn);
            layoutContainer.removeChild(license);

            document.getElementById("progress-container").style.display =
                "block";
            render();
        });
        layoutContainer.appendChild(studyBtn);

        license.href = "./LICENSE";
        license.target = "_blank";
        license.id = "license-link";
        license.textContent = "License";
        layoutContainer.appendChild(license);
    }
}

function getKanjiCount() {
    return (input.match(/[\u4e00-\u9faf]/g) || []).length;
}

function render() {
    word.replaceChildren();

    for (const ch of input) {
        const div = document.createElement("div");

        if (isKanji(ch)) {
            const charSVG = document
                .getElementById("grid-background")
                .cloneNode(true);
            const id = "c_" + Math.random().toString(36).slice(2);

            charSVG.id = id;
            div.className = "kanji";
            div.appendChild(charSVG);
            word.appendChild(div);

            const writer = HanziWriter.create(id, ch, {
                charDataLoader: async function (char, onComplete) {
                    const response = await fetch(
                        "./data/animcjkTransformed/" + char + ".json",
                    );
                    const charData = await response.json();
                    onComplete(charData);
                },
                width: 300,
                height: 300,
                showCharacter: false,
                padding: 0,
                leniency: 1.5,
                drawingWidth: 50,
                drawingColor: "#ddd",
                outlineColor: cycledCount > 0 ? "#222222" : "#3d3d3d",
                showOutline: cycledCount >= 2 ? false : true,
                strokeColor: "#ddd",
                highlightCompleteColor: "#a1ff82",
            });

            writer.quiz({
                onComplete: function (summaryData) {
                    completedCount++;

                    if (completedCount === getKanjiCount()) {
                        setTimeout(() => {
                            handleAllQuizzesComplete();
                        }, 700);
                    }
                },
            });
        } else {
            div.textContent = ch;
            div.className = "kana anim-cjk-match";
            div.lang = "ja";
            word.appendChild(div);
        }
    }
}

const progressBar = document.getElementById("progress-bar");

function goToStep(stepNumber) {
    const safeStep = Math.max(0, Math.min(stepNumber, totalSteps));
    const percentage = (safeStep / totalSteps) * 100;
    progressBar.style.width = percentage + "%";
}

function handleAllQuizzesComplete() {
    cycledCount++;
    completedCount = 0;
    goToStep(cycledCount);

    if (cycledCount <= totalSteps - 1) {
        render();
    }
}

function swipeToReload() {
    let startX = 0;
    let endX = 0;
    let isDragging = false;
    const threshold = 100;

    const handleGesture = () => {
        if (endX > startX + threshold) {
            window.location.replace(window.location.pathname);
        }
    };

    const getX = (e) => {
        return e.touches ? e.touches[0].screenX : e.screenX;
    };

    const startAction = (e) => {
        if (e.target.closest("div.kanji")) return;

        isDragging = true;
        startX = getX(e);
    };

    const endAction = (e) => {
        if (!isDragging) return;

        endX = e.changedTouches ? e.changedTouches[0].screenX : e.screenX;
        isDragging = false;

        handleGesture();
    };

    window.addEventListener("touchstart", startAction);
    window.addEventListener("touchend", endAction);
    window.addEventListener("mousedown", startAction);
    window.addEventListener("mouseup", endAction);
}

assignInput();
swipeToReload();
