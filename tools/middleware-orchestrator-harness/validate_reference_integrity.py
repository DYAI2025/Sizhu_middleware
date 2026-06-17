#!/usr/bin/env python3
"""Check internal markdown references in the skill package."""
from __future__ import annotations

import re
import sys
from pathlib import Path

LINK_RE = re.compile(r"\((references/[^)]+|examples/[^)]+|scripts/[^)]+)\)")
MENTION_RE = re.compile(r"`((?:references|examples|scripts)/[^`]+)`")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: validate_reference_integrity.py <skill-directory>", file=sys.stderr)
        return 2
    root = Path(sys.argv[1])
    errors: list[str] = []
    for md in root.rglob("*.md"):
        text = md.read_text(encoding="utf-8")
        for match in list(LINK_RE.finditer(text)) + list(MENTION_RE.finditer(text)):
            rel = match.group(1).strip()
            if rel.startswith("scripts/") and " " in rel:
                continue
            target = root / rel
            if not target.exists():
                errors.append(f"{md.relative_to(root)} references missing file: {rel}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("Reference integrity validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
