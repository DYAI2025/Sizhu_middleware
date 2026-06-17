#!/usr/bin/env python3
"""Validate subskill compatibility contract completeness."""
from __future__ import annotations

import re
import sys
from pathlib import Path

REQUIRED_FIELDS = [
    "purpose", "trigger_conditions", "required_inputs", "accepted_evidence_types",
    "output_artifacts", "state_changes", "governance_gates", "failure_modes",
    "incompatible_modes", "escalation_path",
]
REQUIRED_CAPABILITIES = [
    "claude-cowork-project-orchestrator",
    "middleware-api-architect",
    "project-super-gpt-harness",
    "repo-architecture-visualization-harness",
    "goal-forge",
    "ultimate-prompt-architect",
    "research-backed-skill-builder",
]


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: validate_subskill_contracts.py <skill-directory>", file=sys.stderr)
        return 2
    root = Path(sys.argv[1])
    path = root / "references" / "subskill-compatibility-contract.md"
    if not path.exists():
        print("ERROR: subskill compatibility contract missing")
        return 1
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    for capability in REQUIRED_CAPABILITIES:
        marker = f"capability_id: {capability}"
        if marker not in text:
            errors.append(f"missing capability contract: {capability}")
    sections = re.split(r"^### capability_id: ", text, flags=re.MULTILINE)[1:]
    for section in sections:
        first_line = section.splitlines()[0].strip()
        for field in REQUIRED_FIELDS:
            if f"- {field}:" not in section:
                errors.append(f"{first_line} missing field: {field}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("Subskill compatibility validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
