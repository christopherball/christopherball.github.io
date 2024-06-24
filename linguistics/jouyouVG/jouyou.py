import os

file = open('jouyou.txt', 'r')
lines = file.read().splitlines()

for i in lines:
    print(i)
    hexFilename = format(ord(i),'x').zfill(5) + ".svg"
    print(hexFilename)
    kanjiFilename = i + ".svg"
    print(kanjiFilename)
    os.rename(hexFilename, kanjiFilename)
