# T8 — LGQ live generate→QA boundary smoke

`scripts/smoke/lgq-live-smoke.ts` (`npm run smoke:lgq`). The flag-gated real-boundary
evidence for the live generate→QA loop (REQ-LGQ-008 success signal). It drives the
**real** wired path — `OpenRouterImageGenerationProvider` + `OpenRouterQualityGateProvider`
+ the cost cap + the runner-side PII redaction — not a re-implementation.

## Reality-ledger status

| Evidence class | Status |
|---|---|
| Guards wired-in-prod (importer reachable from `createApp`) | **verified** (`lgq.wiredInProd.contract`) |
| Dry-run guard-discrimination (drift / qa-drift / 402 / pii / cost / blank-image) | **verified** (modes below, all green; image + qa-default-pass discriminations mutation-proven) |
| Real-boundary live run (real OpenRouter key, real image + score) | **RED-for-real — operator-run only.** Not flipped by the agent (no real key). Only the USER reclassifies not-real→real, and only after an adversarial re-verify of a green `--live` run. |

## Modes (dry-run = no network, no spend; inject modes forced to dry-run)

```bash
npm run smoke:lgq                       # happy path (no key needed — dummy injected)
npm run smoke:lgq -- --inject-drift     # image contract-drift guard bites (ContractDriftError)
npm run smoke:lgq -- --inject-qa-drift  # QA no-default-pass guard bites (unparseable score → throw)
npm run smoke:lgq -- --inject-402       # non-2xx fails loud (OpenRouterHttpError)
npm run smoke:lgq -- --inject-pii       # PII-on-wire detector catches sentinels on BOTH surfaces
npm run smoke:lgq -- --live             # REAL call — ~$0.04 on 1 image (needs the key)
```

## What a green `--live` proves (discriminating, not presence checks)

1. **Slug freshness** — both model ids exist in the live `/models` catalog (fail loud before spend).
2. **Real image** — valid PNG/JPEG, decoded bytes ≥ 1000 (a 1×1/blank/truncated image FAILS; hosted `https` URL accepted as the provider's real contract).
3. **Image-conditioned QA** — scores the real image AND a 1×1 control with the same rubric; FAILS unless real ≫ control (a default-pass returns equal scores → RED).
4. **Real cost** — FAILS if the cap accrued the per-image *estimate* because the live response omitted `usage.cost` (a fabricated "real cost" is rejected).
5. **No PII on wire** — prompt compiled via the real `renderPrompt` path + `redactKnownPiiValues`; captured bodies, headers and URLs carry no sentinel.
6. **Secret hygiene** — the resolved key appears in no captured material (Authorization redacted at capture) and no printed line.

## Provenance

The harness was authored, then adversarially reviewed by 5 independent lenses (25
findings); the 3 blocking + the high-value important/safety findings were fixed and
re-verified. **Known boundaries (stated, not hidden):** the live leg runs a single
1-candidate generation, so the count-cap *bite* and the n>1 byte-dup-fan-out paths are
not exercised live (both are unit-tested; a dry-run cap-bite assertion proves the
enforcer refuses at the ceiling). After a green `--live` run, re-read the captured
`responseBody` and confirm a real non-default score + a real image before flipping the
ledger (CLAUDE.md P7).
