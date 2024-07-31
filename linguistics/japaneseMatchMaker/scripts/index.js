function shuffle(array) {
    let currentIndex = array.length;

    while (currentIndex != 0) {
        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex],
            array[currentIndex],
        ];
    }
}

function createSlotsAndExtractAnswerChoices() {
    let choices = [];
    document.querySelectorAll("#outputRenderedHTML ruby").forEach((r) => {
        const choice = r.innerHTML.replace(/<rt>.*?<\/rt>/g, "");
        const jpBlank = "＿";
        [...choice].forEach((c) => {
            choices.push([
                c,
                "<div id='choice" +
                    Math.floor(Date.now() * Math.random()) +
                    "' class='choice' draggable='true'>" +
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
    document.getElementById("choices").innerHTML = choices
        .map((c) => c[1])
        .join("");
    registerDragDropEventHandlers();
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

    document
        .getElementById("outputHTML")
        .addEventListener("input", function () {
            let tempHTML = document.getElementById("outputHTML").value;
            document.getElementById("outputRenderedHTML").innerHTML = tempHTML;
            createSlotsAndExtractAnswerChoices();
        });

    if (htmlQs != undefined && htmlQs.length > 0) {
        Base64.extendString();
        try {
            document.getElementById("outputHTML").value = htmlQs.fromBase64();
            document
                .getElementById("outputHTML")
                .dispatchEvent(new Event("input"));
        } catch (e) {
            console.log(e);
        }
    }

    if (hideInputQs != undefined && hideInputQs.length > 0) {
        document.getElementById("inputZone").classList.add("noDisplay");
    }
}

window.onload = main();
