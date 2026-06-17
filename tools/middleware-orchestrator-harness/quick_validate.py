#!/usr/bin/env python3
"""Validate the middleware-project-orchestrator-harness skill package."""
from __future__ import annotations

import re
import sys
from pathlib import Path

REQUIRED_FILES = [
    "SKILL.md",
    "README.md",
    "agents/openai.yaml",
    "references/source-policy.md",
    "references/source-map.md",
    "references/meta-decision-layer.md",
    "references/decision-packet-schema.md",
    "references/subskill-compatibility-contract.md",
    "references/skill-routing-registry.md",
    "references/middleware-api-thinking-core.md",
    "references/project-harness-governance.md",
    "references/semantic-ontology-model.md",
    "references/repo-architecture-visualization-model.md",
    "references/goalforge-objective-contract.md",
    "references/output-contracts.md",
    "references/validation-rules.md",
    "references/evaluation-plan.md",
    "references/platform-compatibility.md",
    "references/anti-hallucination-evidence-policy.md",
    "examples/vague-project-intake.md",
    "examples/middleware-api-design-routing.md",
    "examples/repo-architecture-audit.md",
    "examples/skill-routing-decision.md",
    "examples/goalforge-objective.md",
    "examples/agent-ready-api-wrapper.md",
    "examples/recalibration-loop.md",
    "scripts/validate_decision_packet.py",
    "scripts/validate_reference_integrity.py",
    "scripts/validate_subskill_contracts.py",
]

REQUIRED_LABELS = ["FACT", "INFERENCE", "ASSUMPTION", "SOURCE_NEEDED", "MISSING"]
FORBIDDEN_TERMS = ['TO' + 'DO', 'TB' + 'D', '<place' + 'holder>', '{' + '{', '}' + '}']
FALSE_DETERMINISTIC_CLAIMS = [
    'mathematically guarantees' + ' correct code',
    'guarantees' + ' fehlerfreien code',
    'provably guarantees' + ' safe runtime',
    'lpml' + ' guarantees',
    'xml guarantees' + ' correctness',
]
SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"ghp_[A-Za-z0-9_]{20,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def check_frontmatter(skill_md: str) -> list[str]:
    errors: list[str] = []
    if not skill_md.startswith("---\n"):
        return ["SKILL.md missing YAML frontmatter"]
    end = skill_md.find("\n---", 4)
    if end == -1:
        return ["SKILL.md frontmatter is not closed"]
    fm = skill_md[4:end]
    name = re.search(r"^name:\s*([a-z0-9-]+)\s*$", fm, re.MULTILINE)
    desc = re.search(r"^description:\s*(.+)$", fm, re.MULTILINE)
    if not name:
        errors.append("frontmatter missing valid hyphen-case name")
    elif name.group(1) != "middleware-project-orchestrator-harness":
        errors.append("frontmatter name mismatch")
    if not desc:
        errors.append("frontmatter missing description")
    elif "<" in desc.group(1) or ">" in desc.group(1):
        errors.append("description contains angle brackets")
    if "metadata:" not in fm or "version: 0.1.0" not in fm:
        errors.append("metadata.version 0.1.0 missing")
    return errors


def validate(root: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not root.exists() or not root.is_dir():
        return [f"skill directory not found: {root}"], warnings

    for rel in REQUIRED_FILES:
        if not (root / rel).exists():
            errors.append(f"required file missing: {rel}")

    skill_files = list(root.rglob("SKILL.md"))
    if len(skill_files) != 1:
        errors.append(f"expected exactly one SKILL.md, found {len(skill_files)}")

    if (root / "SKILL.md").exists():
        errors.extend(check_frontmatter(read(root / "SKILL.md")))

    combined = "\n".join(read(p) for p in root.rglob("*") if p.is_file())
    for term in FORBIDDEN_TERMS:
        if term in combined:
            errors.append(f"forbidden placeholder term found: {term}")
    for label in REQUIRED_LABELS:
        if label not in combined:
            errors.append(f"evidence label missing: {label}")
    lowered = combined.lower()
    for phrase in FALSE_DETERMINISTIC_CLAIMS:
        if phrase in lowered:
            errors.append(f"false deterministic claim found: {phrase}")
    for pattern in SECRET_PATTERNS:
        if pattern.search(combined):
            errors.append(f"possible secret detected by pattern: {pattern.pattern}")

    required_phrases = [
        "Decision Packet",
        "Subskill Compatibility Contract",
        "Middleware/API Architecture Brief",
        "GoalForge Objective",
        "Recalibration Loop",
        "No endpoint invention",
        "No phantom tools",
    ]
    for phrase in required_phrases:
        if phrase not in combined:
            warnings.append(f"expected phrase not found: {phrase}")

    return errors, warnings


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: quick_validate.py <skill-directory>", file=sys.stderr)
        return 2
    errors, warnings = validate(Path(sys.argv[1]))
    for warning in warnings:
        print(f"WARNING: {warning}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("Skill package validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
