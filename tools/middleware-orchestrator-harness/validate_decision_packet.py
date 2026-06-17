#!/usr/bin/env python3
"""Validate a Decision Packet JSON or simple YAML file."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

TASK_CLASSES = {
    "qa", "operations", "investigation", "development", "audit", "skill_build",
    "architecture", "repo_analysis", "middleware_design", "harness_design",
}
RISK_LEVELS = {"low", "medium", "high", "blocked"}
LABEL_ARRAYS = ["facts", "inferences", "assumptions", "missing", "source_needed"]


def load_packet(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    try:
        import yaml  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise SystemExit("YAML input requires PyYAML. Provide JSON or install PyYAML.") from exc
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise SystemExit("Decision Packet must parse to an object")
    return data


def validate(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    packet = data.get("decision_packet", data)
    if not isinstance(packet, dict):
        return ["missing decision_packet object"]
    for field in ["request_id", "normalized_intent", "task_class", "evidence", "routing", "governance", "output_contract"]:
        if field not in packet:
            errors.append(f"missing field: {field}")
    if packet.get("task_class") not in TASK_CLASSES:
        errors.append(f"invalid task_class: {packet.get('task_class')}")
    evidence = packet.get("evidence", {})
    if not isinstance(evidence, dict):
        errors.append("evidence must be an object")
    else:
        for label in LABEL_ARRAYS:
            if label not in evidence or not isinstance(evidence[label], list):
                errors.append(f"evidence.{label} must be a list")
        confidence = evidence.get("confidence")
        if not isinstance(confidence, int) or not (1 <= confidence <= 5):
            errors.append("evidence.confidence must be integer 1..5")
    routing = packet.get("routing", {})
    if isinstance(routing, dict):
        for field in ["required_modules", "optional_modules", "blocked_modules"]:
            if field not in routing or not isinstance(routing[field], list):
                errors.append(f"routing.{field} must be a list")
    else:
        errors.append("routing must be an object")
    governance = packet.get("governance", {})
    if isinstance(governance, dict):
        if governance.get("risk_level") not in RISK_LEVELS:
            errors.append(f"invalid governance.risk_level: {governance.get('risk_level')}")
    else:
        errors.append("governance must be an object")
    output = packet.get("output_contract", {})
    if isinstance(output, dict):
        for field in ["artifact_type", "format", "validation_required"]:
            if field not in output:
                errors.append(f"output_contract.{field} missing")
    else:
        errors.append("output_contract must be an object")
    return errors


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: validate_decision_packet.py <packet.json|packet.yaml>", file=sys.stderr)
        return 2
    data = load_packet(Path(sys.argv[1]))
    errors = validate(data)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("Decision Packet validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
