def updateSVG(num):
    fileName = str(num) + ".svg"
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

            path:not([id$=s1], [id$=s2], [id$=s3]) {
                display: none;
            }

            g text {
                /* display: none; */
            }
        </style>"""
            )
            newLines.append("\n")
        else:
            newLines.append("\n")

    with open(fileName, "w") as f:
        f.writelines(newLines)


for i in range(1, 324):
    updateSVG(i)
