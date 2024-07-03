import os


def updateSVG(kanji):
    fileName = str(kanji) + ".svg"
    file = open(fileName, "r")
    lines = file.read().splitlines()
    newLines = []
    for i in lines:
        newLines.append(i)
        if i.lstrip().startswith('<svg xmlns="http://www.w3.org/2000/svg"'):
            newLines.append(
                """
        <style>
            path {
                stroke: #E93B81;
            }

            g text {
                display: none;
            }
        </style>"""
            )
            newLines.append("\n")
        else:
            newLines.append("\n")

    with open(fileName, "w") as f:
        f.writelines(newLines)


file = open("jouyou.txt", "r")
lines = file.read().splitlines()

for i in lines:
    updateSVG(i)
