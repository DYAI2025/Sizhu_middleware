# Validation Rules

## Static package validation

A Skill package must satisfy:

- Required files exist:
  - `SKILL.md`
  - `README.md`
  - `agents/openai.yaml`
  - all required references
  - all required examples
  - all required scripts
- `SKILL.md` frontmatter is valid YAML.
- `SKILL.md` has `name` and `description`.
- Name is hyphen-case.
- Description contains no angle brackets.
- No unresolved planning markers or literal placeholder tokens may remain in deliverable files.
- No obvious secrets or private credentials.
- Exactly one `SKILL.md` entrypoint exists in the package.

## Required semantic checks

- Evidence labels are defined: FACT, INFERENCE, ASSUMPTION, SOURCE_NEEDED, MISSING.
- Decision Packet schema is present.
- Subskill contracts contain all required fields.
- Output contracts are declared.
- Validation and evaluation plans are present.
- False deterministic claims are absent.
- Tool availability is not invented.
- DPoP, mTLS, OAuth/OIDC, JWT, and sender-constrained tokens are represented as context-dependent options, not universal requirements.

## Middleware/API checks

Block or warn if:

- API behavior is asserted without contract, code, log, trace, HAR/cURL, or explicit example.
- Authn/authz is unclear.
- Object/function-level authorization is omitted where IDs or business actions exist.
- Secrets appear in code, examples, logs, or contracts.
- Write retries are proposed without idempotency.
- Event flows lack schema, ordering, dedupe, replay, or DLQ.
- Observability is missing.
- Tests are missing.

## Harness checks

Block or warn if:

- Knowledge files are treated as tools.
- ZIP archives are assumed to be automatically installed Skills.
- MCP, GitHub, CI, shell, browser, or web access is claimed without runtime evidence.
- Actions or tools can mutate external systems without explicit user authorization.
- Evaluation scenarios are missing.

## Validation scripts

- `scripts/quick_validate.py`: package-level static and semantic checks.
- `scripts/validate_decision_packet.py`: Decision Packet JSON/YAML validation.
- `scripts/validate_reference_integrity.py`: internal reference link checks.
- `scripts/validate_subskill_contracts.py`: compatibility contract completeness.
