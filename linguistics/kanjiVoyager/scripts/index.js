let fetchedKanjiData = null;
let availableComponentFilters = [];
let componentRange = [];

function preload() {
    componentRange = arrayRange(0, 323, 1);
    fetchKanjiData();
    setFillerContent();
    randomizeAnimationDelays();
}

function randomizeAnimationDelays() {
    // Programmatically randomizing the delay for each region glow effect to create
    // artificial stagger and randomness.
    arrayRange(1, 9, 1).forEach((i) => {
        document
            .getElementById("r" + i)
            .style.setProperty("--anim-delay", Math.random() * 5 + "s");
    });
}

function fetchKanjiData() {
    var myHeaders = new Headers();
    myHeaders.append("pragma", "no-cache");
    myHeaders.append("cache-control", "no-cache");

    var myInit = {
        method: "GET",
        headers: myHeaders,
    };

    var myRequest = new Request("data/kanjiData.json");

    fetch(myRequest, myInit)
        .then((response) => response.json())
        .then((data) => (fetchedKanjiData = data))
        .then(() => main())
        .catch((e) => {
            console.log("Error: " + e);
        });
}

function onComponentClick() {
    let componentId = this.src.replace(/.*\//g, "").replace(".svg", "");

    if (
        !document
            .getElementById("c" + componentId)
            .classList.contains("unavailable")
    ) {
        if (availableComponentFilters.includes(componentId)) {
            availableComponentFilters = availableComponentFilters.filter(
                (c) => c !== componentId
            );
        } else {
            availableComponentFilters.push(componentId);
        }

        document.getElementById("c" + componentId).classList.toggle("active");
        refreshKanjiResults();
        updateRegionAvailability();
    }
}

function updateRegionAvailability() {
    arrayRange(1, 9, 1).forEach((i) => {
        // If all components within a given region are not available
        if (
            document.querySelectorAll("#r" + i + "Content>img.unavailable")
                .length ==
            document.querySelectorAll("#r" + i + "Content>img").length
        ) {
            document
                .querySelector("#r" + i + "Content")
                .classList.remove("expanded");
            document.querySelector("#r" + i).classList.add("regionUnavailable");
        }
        // Else if all components are available across all regions
        else if (
            document.querySelectorAll('div.components img[id^="c"].unavailable')
                .length == 0
        ) {
            document
                .querySelector("#r" + i)
                .classList.remove("regionUnavailable");
            document
                .querySelector("#r" + i + "Content")
                .classList.remove("expanded");
        }
        // Else the given region is available as there are one or more available components
        else {
            document
                .querySelector("#r" + i)
                .classList.remove("regionUnavailable");
            document
                .querySelector("#r" + i + "Content")
                .classList.add("expanded");
        }
    });
}

function onRegionClick() {
    if (!this.classList.contains("regionUnavailable")) {
        document
            .getElementById(this.id + "Content")
            .classList.toggle("expanded");
    }
}

function refreshKanjiResults() {
    // Represents all possible primary keys of the form:
    // ['1.人', '1.化',...]
    let allKanjiDataKeys = Object.keys(fetchedKanjiData);

    // Represents all kanji related to each active component of the form:
    // [['人', '化', '仏'],['比', '化']]
    let activeKanjiCollections = [];

    // Represents components that share common kanji between them, of the form:
    // [18, 148, 26, 25, 60, 67]
    let componentsContainingActiveKanji = [];

    // Represents the final output of all kanji matching the composite of the form:
    // ['人', '化', '仏', '仁',...]
    let results = [];

    // Determining the active kanji per component selected.
    availableComponentFilters.forEach((c) => {
        activeKanjiCollections.push(
            allKanjiDataKeys
                .filter((k) => k.startsWith(c + "."))
                .map((k) => k.replace(/.*\./g, ""))
        );
    });

    // Provides results for the complete intersection across all subarrays.
    results =
        activeKanjiCollections.length > 0
            ? activeKanjiCollections.reduce((a, b) =>
                  a.filter((c) => b.includes(c))
              )
            : [];

    results.forEach((c) => {
        componentsContainingActiveKanji.push(
            ...allKanjiDataKeys
                .filter((k) => k.endsWith(c))
                .map((k) => Number(k.replace(/\../g, "")))
        );
    });

    componentsContainingActiveKanji = new Set(componentsContainingActiveKanji);

    let noComponentsSelected =
        document.querySelector("div.components img.active") == null;

    let componentsToMakeUnavailable = noComponentsSelected
        ? []
        : componentRange.filter((x) => !componentsContainingActiveKanji.has(x));

    componentsToMakeUnavailable.forEach((c) => {
        document.getElementById("c" + c).classList.add("unavailable");
    });

    if (noComponentsSelected) {
        resetPage();
    } else {
        [...componentsContainingActiveKanji].forEach((c) => {
            document.getElementById("c" + c).classList.remove("unavailable");
        });
        document.getElementById("results").innerHTML = htmlify(results);
        document.querySelectorAll("img.kanji").forEach((img) =>
            img.addEventListener(
                "click",
                () => {
                    copyToClipboard(img.title);
                    showToastNotification("Kanji Copied!");
                },
                false
            )
        );

        document.getElementById("resetBtn").addEventListener(
            "click",
            () => {
                resetPage();
            },
            false
        );
    }
}

function resetPage() {
    document
        .querySelectorAll("div.components img.active")
        .forEach((e) => e.classList.remove("active"));
    componentRange.forEach((c) => {
        document.getElementById("c" + c).classList.remove("unavailable");
    });
    setFillerContent();
    availableComponentFilters = [];

    arrayRange(1, 9, 1).forEach((i) => {
        document.querySelector("#r" + i).classList.remove("regionUnavailable");
        document
            .querySelector("#r" + i + "Content")
            .classList.remove("expanded");
    });
}

function htmlify(characters) {
    let allKanjiDataKeys = Object.keys(fetchedKanjiData);
    let lastTotalStrokeVal = null;
    let resultHTML = "";
    let divEl = document.createElement("div");
    let btnEl = document.createElement("button");

    btnEl.innerHTML = "Reset";
    btnEl.setAttribute("id", "resetBtn");

    divEl.innerHTML = "Kanji Search Results" + btnEl.outerHTML;
    divEl.classList.add("title");
    resultHTML += divEl.outerHTML;

    [...characters].forEach((c) => {
        let firstKeyInstance = allKanjiDataKeys.find((e) => e.endsWith(c));
        let currentTotalStrokeVal = Number(
            fetchedKanjiData[firstKeyInstance]["TotalStrokes"]
        );

        if (
            lastTotalStrokeVal == null ||
            currentTotalStrokeVal > lastTotalStrokeVal
        ) {
            let divEl = document.createElement("div");
            divEl.classList.add("kanjiStrokeCount");
            divEl.innerHTML = currentTotalStrokeVal;
            resultHTML += divEl.outerHTML;
            lastTotalStrokeVal = currentTotalStrokeVal;
        }

        let imgEl = document.createElement("img");
        imgEl.classList.add("kanji");
        imgEl.src = "assets/jouyouNoStrokeCountVG/" + c + ".svg";
        imgEl.title = c;
        resultHTML += imgEl.outerHTML;
    });
    return resultHTML;
}

function copyToClipboard(value) {
    var tempInput = document.createElement("input");
    tempInput.value = value;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
}

function showToastNotification(msg) {
    var toastEl = document.getElementById("toastNotifier");
    toastEl.innerHTML = msg;
    toastEl.className = "show";
    setTimeout(function () {
        toastEl.className = toastEl.className.replace("show", "");
    }, 3000);
}

function arrayRange(start, stop, step) {
    return Array.from(
        { length: (stop - start) / step + 1 },
        (value, index) => start + index * step
    );
}

function setFillerContent() {
    document.getElementById("results").innerHTML =
        document.getElementById("blankSpaceFiller").innerHTML;
}

function registerEventListeners() {
    document
        .querySelectorAll("div.components img[id^=c]")
        .forEach((img) =>
            img.addEventListener("click", onComponentClick, false)
        );

    document
        .querySelectorAll("div.components img[id^=r]")
        .forEach((img) => img.addEventListener("click", onRegionClick, false));
}

function main() {
    registerEventListeners();
}

window.onload = preload;
