function createSlotsAndExtractAnswerChoices(index) {
    let choices = [];
    document
        .querySelectorAll("#renderedHTML" + index + " ruby")
        .forEach((r) => {
            const choice = r.innerHTML.replace(/<rt>.*?<\/rt>/g, "");
            const jpBlank = "＿";
            [...choice].forEach((c) => {
                choices.push([
                    c,
                    "<div id='choice" +
                        Math.floor(Date.now() * Math.random()) +
                        "' class='choice' draggable='true' data-zone='" +
                        index +
                        "'>" +
                        c +
                        "</div>",
                ]);
            });

            let repVal = "";
            for (let x = 0; x < choice.length; x++) {
                repVal +=
                    "<div id='slot" +
                    Math.floor(Date.now() * Math.random()) +
                    "' class='slot' answer='" +
                    choice.substring(x, x + 1) +
                    "' data-zone='" +
                    index +
                    "'>＿</div>";
            }

            r.outerHTML = r.outerHTML.replace(
                /<ruby>.+<rt>/g,
                "<ruby>" + repVal + "<rt>"
            );
        });

    choices = choices.sort((a, b) => {
        return a[0].localeCompare(b[0], "ja");
    });

    document.getElementById("choices" + index).innerHTML = choices
        .map((c) => c[1])
        .join("");
}

function generateOutputContainer(index) {
    let outputContainerDiv = document.createElement("div");
    let renderedHTMLDiv = document.createElement("div");
    let choicesDiv = document.createElement("div");

    outputContainerDiv.classList.add("outputContainer");
    renderedHTMLDiv.classList.add("renderedHTML");
    choicesDiv.classList.add("choices");

    renderedHTMLDiv.id = "renderedHTML" + index;
    choicesDiv.id = "choices" + index;

    outputContainerDiv.appendChild(renderedHTMLDiv);
    outputContainerDiv.appendChild(choicesDiv);

    return outputContainerDiv;
}

function registerDragDropEventHandlers() {
    Array.from(document.getElementsByClassName("slot")).forEach((s) => {
        s.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.target.classList.add("hover");
        });

        s.addEventListener("dragleave", (e) => {
            e.preventDefault();
            e.target.classList.remove("hover");
        });

        s.addEventListener("drop", (e) => {
            e.preventDefault();
            const data = e.dataTransfer.getData("text/plain");
            const draggableElement = document.getElementById(data);

            e.target.classList.remove("hover");

            // If the zone membership of the draggable doesn't match the target slot, bail.
            // This check only really applies in cases where clusterSize QS is specified.
            if (e.target.dataset.zone != draggableElement.dataset.zone) return;

            // If the target doesn't contain a guess yet
            if (e.target.innerHTML == "＿") {
                // If the face value of the draggable matches the target answer
                if (
                    draggableElement.innerHTML ==
                    e.target.getAttribute("answer")
                ) {
                    e.target.classList.remove("incorrect");
                    e.target.classList.add("correct");
                }
                // Else the face value of the draggable doesn't match the target answer
                else {
                    e.target.classList.remove("correct");
                    e.target.classList.add("incorrect");
                    e.target.setAttribute("draggable", "true");
                }

                // Transfering the face value from the draggable to the target
                e.target.innerHTML = draggableElement.innerHTML;

                // If the draggable came from another slot, reset said slot
                if (data.startsWith("slot")) {
                    draggableElement.innerHTML = "＿";
                    draggableElement.removeAttribute("draggable");
                    draggableElement.classList.remove("incorrect");
                }
                // Else the draggable came from the choice pool, so remove it from the DOM
                else {
                    draggableElement.remove();
                }
            }
            // Else the target already contains a guess and we are replacing it from either the choice pool or another slot
            else {
                // If swapping two guesses already in slots results in both having correct answers now
                if (
                    draggableElement.innerHTML ==
                        e.target.getAttribute("answer") &&
                    e.target.innerHTML ==
                        draggableElement.getAttribute("answer")
                ) {
                    e.target.classList.remove("incorrect");
                    e.target.classList.add("correct");
                    e.target.removeAttribute("draggable");

                    draggableElement.classList.remove("incorrect");
                    draggableElement.classList.add("correct");
                    draggableElement.removeAttribute("draggable");
                }
                // Else if the target will become correct as a result of this swap, but the source will become incorrect
                else if (
                    draggableElement.innerHTML ==
                        e.target.getAttribute("answer") &&
                    e.target.innerHTML !=
                        draggableElement.getAttribute("answer")
                ) {
                    e.target.classList.remove("incorrect");
                    e.target.classList.add("correct");
                    e.target.removeAttribute("draggable");

                    draggableElement.classList.remove("correct");
                    draggableElement.classList.add("incorrect");
                    draggableElement.setAttribute("draggable", "true");
                }
                // Else if the target will remain incorrect as a result of this swap, but the source will become correct
                else if (
                    draggableElement.innerHTML !=
                        e.target.getAttribute("answer") &&
                    e.target.innerHTML ==
                        draggableElement.getAttribute("answer")
                ) {
                    e.target.classList.remove("correct");
                    e.target.classList.add("incorrect");
                    e.target.setAttribute("draggable", "true");

                    draggableElement.classList.remove("incorrect");
                    draggableElement.classList.add("correct");
                    draggableElement.removeAttribute("draggable");
                }
                // Else swapping will still result in both remaining incorrect
                else {
                    e.target.classList.remove("correct");
                    e.target.classList.add("incorrect");
                    e.target.setAttribute("draggable", "true");

                    draggableElement.classList.remove("correct");
                    draggableElement.classList.add("incorrect");
                    draggableElement.setAttribute("draggable", "true");
                }

                // Regardless of which of the 4 possibilities takes place, the face values must swap
                let tempOldAnaswer = e.target.innerHTML;
                e.target.innerHTML = draggableElement.innerHTML;
                draggableElement.innerHTML = tempOldAnaswer;
            }
        });
    });

    Array.from(document.getElementsByClassName("choice")).forEach((c) => {
        c.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", e.target.id);
        });
    });

    Array.from(document.getElementsByClassName("slot")).forEach((s) => {
        s.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", e.target.id);
        });
    });
}

function main() {
    const params = new URLSearchParams(window.location.search);
    const htmlQs = params.get("html");
    const hideInputQs = params.get("hideInput");
    const clusterSizeQs = params.get("clusterSize");

    document.getElementById("inputHTML").addEventListener("input", function () {
        let tempHTML = document.getElementById("inputHTML").value;
        let sentenceHTMLChunks = [];
        document.getElementById("playZone").innerHTML = "";

        if (!clusterSizeQs || (clusterSizeQs && !Number(clusterSizeQs))) {
            sentenceHTMLChunks.push(tempHTML);
        } else {
            sentenceHTMLChunks = tempHTML
                .replaceAll("<br/>", "")
                .split("。")
                .filter((c) => c.length > 0)
                .map((c) => {
                    return c + "。";
                });
        }

        if (clusterSizeQs && clusterSizeQs > 1) {
            let formedClusterCount = 0;
            let tempReplaceSentenceHTMLChunks = [];
            let formingChunk = "";

            sentenceHTMLChunks.forEach((c, index) => {
                if ((index + 1) % clusterSizeQs != 0) {
                    formingChunk += c;

                    if (index == sentenceHTMLChunks.length - 1) {
                        tempReplaceSentenceHTMLChunks.push(formingChunk);
                    }
                } else {
                    formingChunk += c;
                    tempReplaceSentenceHTMLChunks.push(formingChunk);
                    formingChunk = "";
                }
            });

            sentenceHTMLChunks = tempReplaceSentenceHTMLChunks;
        }

        sentenceHTMLChunks.forEach((c, index) => {
            let outputContainer = generateOutputContainer(index);

            outputContainer.getElementsByClassName(
                "renderedHTML"
            )[0].innerHTML = c;

            document.getElementById("playZone").appendChild(outputContainer);

            createSlotsAndExtractAnswerChoices(index);
        });

        registerDragDropEventHandlers();
        this.style.height = "auto";
        this.style.height = this.scrollHeight + "px";
    });

    // If html was passed to the tool via the URL
    if (htmlQs != undefined && htmlQs.length > 0) {
        Base64.extendString();
        try {
            document.getElementById("inputHTML").value = htmlQs.fromBase64();
            document
                .getElementById("inputHTML")
                .dispatchEvent(new Event("input"));
        } catch (e) {
            console.log(e);
        }
    }

    // If the URL included the flag indicating we should hide the input HTML portion of the UI
    if (hideInputQs != undefined && hideInputQs.length > 0) {
        document.getElementById("inputZone").classList.add("noDisplay");
    }
}

window.onload = main();
