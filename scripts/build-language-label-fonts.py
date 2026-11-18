#!/usr/bin/env python3
"""Rebuild the two native language-name fonts after npm ci.

Requires fonttools[woff]==4.61.1 and the pinned Fontsource 5.3.0 packages.
Only glyphs needed by the existing language labels are retained, including
GSUB/GPOS layout closure and variable weights. No operating-system fonts are
used. Original copyright/license name records remain in the derivatives;
the accompanying OFL texts are distributed under public/licenses/.

Run with --check to verify the committed binaries without writing anything.
"""
import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path

import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
VERSION = "5.3.0"
LABELS = (
    ("devanagari", "हिन्दी", "Ink Language Names Devanagari"),
    ("bengali", "বাংলা", "Ink Language Names Bengali"),
)


def build(script, label, family):
    package = ROOT / "node_modules" / "@fontsource-variable" / f"noto-sans-{script}"
    if json.loads((package / "package.json").read_text())["version"] != VERSION:
        raise RuntimeError(f"Expected Fontsource {VERSION}: {package}")
    source = package / "files" / f"noto-sans-{script}-{script}-wght-normal.woff2"
    font = TTFont(source, recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    options.recalc_timestamp = False
    options.canonical_order = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=label)
    subsetter.subset(font)

    # Derivatives use distinct families, full names and PostScript names.
    # Preserve legal notices and style/variation names from the source.
    prefix = family.replace(" ", "")
    replacements = {1: family, 3: f"{prefix};Fontsource-{VERSION};labels-v1",
                    4: f"{family} Regular", 6: f"{prefix}-Regular",
                    16: family, 25: prefix}
    names = font["name"]
    for record in list(names.names):
        if record.nameID in replacements:
            names.setName(replacements[record.nameID], record.nameID,
                          record.platformID, record.platEncID, record.langID)
    for name_id, value in replacements.items():
        names.setName(value, name_id, 3, 1, 0x409)

    font.flavor = "woff2"
    font.recalcTimestamp = False
    output = BytesIO()
    font.save(output, reorderTables=True)
    data = output.getvalue()
    # Guard the intended contract rather than merely checking output exists.
    verified = TTFont(BytesIO(data), recalcTimestamp=False)
    assert set(map(ord, label)).issubset(verified.getBestCmap())
    assert "GSUB" in verified and "GPOS" in verified and "fvar" in verified
    assert verified["name"].getDebugName(1) == family
    assert [(a.axisTag, a.minValue, a.maxValue) for a in verified["fvar"].axes] == [("wght", 100.0, 900.0)]
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if fontTools.__version__ != "4.61.1":
        raise RuntimeError("Use fonttools[woff]==4.61.1 for byte-for-byte reproducibility")
    total = 0
    for script, label, family in LABELS:
        data = build(script, label, family)
        path = ROOT / "src" / "assets" / "fonts" / f"ink-language-names-{script}.woff2"
        if args.check:
            if path.read_bytes() != data:
                raise RuntimeError(f"Font does not match reproducible source: {path}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        total += len(data)
        print(json.dumps({"file": str(path.relative_to(ROOT)), "label": label,
                          "family": family, "bytes": len(data),
                          "sha256": sha256(data).hexdigest()}, ensure_ascii=False))
    if total >= 20_000:
        raise RuntimeError(f"Language-name font budget exceeded: {total} bytes")


if __name__ == "__main__":
    main()
