function main() {
    var isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
        );

    if (isMobile) {
        document.querySelectorAll(".english").forEach((e) => {
            e.addEventListener("click", () => {
                e.classList.toggle("englishClickBlur");
            });
        });

        document.querySelectorAll("ruby").forEach((e) => {
            e.addEventListener("click", () => {
                e.querySelector("rt").classList.toggle("rtClickVisible");
            });
        });
    }
}
window.onload = main;
