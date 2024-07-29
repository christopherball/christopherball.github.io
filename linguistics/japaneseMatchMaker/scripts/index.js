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
            choices.push(
                "<div id='choice" +
                    Math.floor(Date.now() * Math.random()) +
                    "' class='choice' draggable='true'>" +
                    c +
                    "</div>"
            );
        });

        let repVal = "";
        for (let x = 0; x < choice.length; x++) {
            repVal +=
                "<div class='slot' answer='" +
                choice.substring(x, x + 1) +
                "'>＿</div>";
        }

        r.outerHTML = r.outerHTML.replace(
            /<ruby>.+<rt>/g,
            "<ruby>" + repVal + "<rt>"
        );
    });

    shuffle(choices);
    document.getElementById("choices").innerHTML = choices.join("");
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

            // If the slot didn't have any answer already, remove said choice from future play.
            if (e.target.innerHTML == "＿") {
                if (
                    draggableElement.innerHTML ==
                    e.target.getAttribute("answer")
                ) {
                    e.target.classList.remove("incorrect");
                    e.target.classList.add("correct");
                } else {
                    e.target.classList.remove("correct");
                    e.target.classList.add("incorrect");
                }

                e.target.innerHTML = draggableElement.innerHTML;
                draggableElement.remove();
            }
            // Else we are replacing one answer with an updated one, so shift old answer back to pool.
            else {
                if (
                    draggableElement.innerHTML ==
                    e.target.getAttribute("answer")
                ) {
                    e.target.classList.remove("incorrect");
                    e.target.classList.add("correct");
                } else {
                    e.target.classList.remove("correct");
                    e.target.classList.add("incorrect");
                }

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
