import xml.etree.ElementTree as ET
from pathlib import Path

SVG_DIR = Path(".")
PHONETIC_FILE = Path("phonetics.txt")
JOUYOU_FILE = Path("jouyou.txt")


def get_all_component_labels(svg_path):
    """
    Return a set of all component labels found in this SVG.
    Works with both 'element' and namespaced 'kvg:element' attributes.
    """
    components = set()

    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()

        for node in root.iter():
            for attr_name, attr_value in node.attrib.items():
                # Handle both plain and namespaced attributes
                if attr_name.endswith("element"):
                    components.add(attr_value)

    except Exception as e:
        print(f"Error parsing {svg_path}: {e}")

    return components


def main():
    # Load Jōyō kanji (preserve order)
    with open(JOUYOU_FILE, encoding="utf-8") as f:
        jouyou = [line.strip() for line in f if line.strip()]

    # Load phonetic components
    with open(PHONETIC_FILE, encoding="utf-8") as f:
        phonetics = [line.strip() for line in f if line.strip()]

    # Map kanji → component set
    kanji_components = {}

    for svg_path in SVG_DIR.glob("*.svg"):
        kanji = svg_path.stem  # filename without ".svg"
        kanji_components[kanji] = get_all_component_labels(svg_path)

    # For each phonetic, find matching Jōyō kanji
    for phonetic in phonetics:
        matches = []

        for k in jouyou:
            if phonetic in kanji_components.get(k, set()):
                matches.append(k)

        if matches:
            print(",".join([phonetic] + matches))
        else:
            print(phonetic)


if __name__ == "__main__":
    main()
