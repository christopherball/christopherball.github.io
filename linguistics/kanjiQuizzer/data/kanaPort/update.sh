#!/bin/bash

mkdir -p data

while IFS= read -r line; do
  char=$(printf "%s" "$line" | jq -r '.character')
  printf "%s" "$line" | jq -c '{strokes: .strokes, medians: .medians}' > "data/$char.json"
done < graphicsJaKana.txt