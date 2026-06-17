# Anti-Hallucination Evidence Policy

## Purpose

Prevent unsupported architecture, tool, platform, security, and runtime claims.

## Forbidden claim patterns

Do not assert:

- An endpoint exists without contract, code, runtime trace, or explicit user-provided example.
- A tool, connector, MCP server, GitHub access, CI access, browser access, or shell access exists without runtime evidence.
- A platform feature behaves a certain way without current official docs.
- A security mechanism is universally required when it is context-dependent.
- LPML, XML, SPL, LOM, lattice theory, Kleene chains, or similar formalisms guarantee correct code or safe runtime behavior.
- A repository implements architecture only because filenames suggest it.
- Tests passed unless tests were actually run and output captured.

## Claim downgrade rules

- Missing official source: label `SOURCE_NEEDED`.
- Missing artifact: label `MISSING`.
- Plausible design recommendation: label `INFERENCE` or `ASSUMPTION`.
- User-provided but unverified statement: label as user-provided evidence, not external fact.
- Incomplete architecture: produce a provisional artifact.

## Required uncertainty markers

Use explicit wording:

- “Based on provided evidence...”
- “Assumption...”
- “Source needed...”
- “Missing...”
- “Blocked until...”

## Bias checks

Watch for:

- **Architecture bias**: preferring complex architecture because the request sounds senior.
- **Tool optimism**: assuming integrations exist because they would be useful.
- **Recency overfit**: treating remembered platform behavior as current.
- **Confirmation bias**: selecting only evidence that supports a preferred architecture.
- **Overconfidence**: using definitive language for inferred claims.

## Self-check before output

- Are all material claims labeled or clearly source-backed?
- Did the output invent any endpoint, runtime, benchmark, test result, or tool availability?
- Did the output separate state, policy, and action?
- Did the output preserve missing information instead of hiding it?
- Did the output identify validation and recalibration path?
