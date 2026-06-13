# FuFirE API — authoritative request contract

> Source: OpenAPI-derived reference supplied by the user on **2026-06-13** during the
> `/agileteam` council gate (`sizhu-secure-fufire-baseline`). This is the **authoritative
> REQUEST contract** for this run — it resolves the earlier "request schemas unconfirmed" risk.
>
> **REAL RESPONSE SAMPLES (2026-06-13):** the user also supplied real responses for
> `/v1/calculate/bazi` (2× — identical pillars for identical input → determinism confirmed) and
> `/v1/calculate/bazi/dayun` (out-of-scope reference). See `fufire-samples/` and the "Response
> shapes" section below. Still missing: real samples for `chronometry/resolve`, `bazi/trace`,
> `wuxing` — response-mapping for those operations stays unverified until samples exist.

- **Base URL:** `https://api.fufire.space`
- **Auth:** API key in the `X-API-Key` request header.
- **Content-Type:** `application/json`
- **`date` is an ISO datetime string** (e.g. `"1990-06-15T14:30:00"`), NOT separate date+time.
  When birth time is unknown → default noon `12:00:00`, `birth_time_known: false`,
  `birth_time_source: default_noon` (project rule).

## In-scope endpoints (this baseline: BaZi / Wu Xing / chronometry)

### POST /v1/chronometry/resolve
Nested `birth` object (the ONLY nested-shape endpoint we use).

Request fields:
- `birth`: object (required) — `{ calendar_policy, datetime, location: {lat, lon}, timezone }`

```json
{
  "birth": {
    "calendar_policy": "gregorian",
    "datetime": "1990-06-15T14:30:00",
    "location": { "lat": 52.52, "lon": 13.405 },
    "timezone": "Europe/Berlin"
  }
}
```

### POST /v1/calculate/bazi
Flat fields.

Request fields:
- `date`: string (required) — ISO datetime
- `tz`: string (optional)
- `lon`: number (optional)
- `lat`: number (optional)
- `standard`: enum("CIVIL" | "LMT" | "TLST") (optional)
- `boundary`: enum("midnight" | "zi") (optional)
- `ambiguousTime`: enum("earlier" | "later") (optional)
- `nonexistentTime`: enum("error" | "shift_forward") (optional)
- `birth_time_known`: boolean (optional)
- `include_trace`: boolean (optional)

```json
{
  "ambiguousTime": "earlier",
  "birth_time_known": true,
  "boundary": "midnight",
  "date": "1990-06-15T14:30:00",
  "lat": 52.52,
  "lon": 13.405,
  "nonexistentTime": "error",
  "standard": "CIVIL",
  "tz": "Europe/Berlin"
}
```

### POST /v1/calculate/bazi/trace
Identical request shape to `/v1/calculate/bazi` (use `include_trace: true`).

### POST /v1/calculate/wuxing
Flat fields. **`lat` and `lon` are required.**

Request fields:
- `date`: string (required) — ISO datetime
- `tz`: string (optional)
- `lon`: number (**required**)
- `lat`: number (**required**)
- `ambiguousTime`: enum("earlier" | "later") (optional)
- `nonexistentTime`: enum("error" | "shift_forward") (optional)

```json
{
  "date": "1990-06-15T14:30:00",
  "tz": "Europe/Berlin",
  "lon": 13.405,
  "lat": 52.52,
  "ambiguousTime": "earlier",
  "nonexistentTime": "error"
}
```

## Other documented endpoints (NOT in this run — north-star / later)

Documented in the contract but out of scope for `sizhu-secure-fufire-baseline`:
`POST /v1/calculate/bazi/dayun`, `POST /v1/calculate/western`, `POST /v1/calculate/fusion`,
`POST /v1/calculate/fusion/vector-map`, `GET /v1/transit/now`, `POST /v1/transit/state`,
`GET /v1/transit/timeline`, `POST /v1/transit/narrative`, `POST /v1/experience/bootstrap`,
`POST /v1/experience/signature-delta`, `POST /v1/experience/daily`, `POST /v1/impact/active`.

## Response shapes (real samples, 2026-06-13)

### POST /v1/calculate/bazi — response (sample: `fufire-samples/bazi.response.json`)

Top-level keys: `input` (echo), `pillars`, `chinese`, `dates`, `transition`, `solar_terms_count`,
`provenance`, `precision`, `derivation_trace`.

- `pillars.{year|month|day|hour}` → `{ stamm, zweig, tier, element }` (German labels:
  `tier` = zodiac animal, `element` = Wu-Xing element).
- `chinese` → `{ year: { stem, branch, animal }, month_master, day_master, hour_master }`
  (English/pinyin labels; `animal` here is English, e.g. "Horse").

**Prompt-variable source map (REQ-F-002/F-003), from real data — bazi only:**
- `animal` ← `chinese.year.animal` (EN) or `pillars.year.tier` (DE) — pick one convention, do not mix.
- `element` ← `pillars.year.element` (year-pillar element) — or define explicitly which pillar.
- `birth_year` ← `transition.solar_year`.
- `dominant_element` ← `wuxing.dominant_element` (REAL wuxing sample, 2026-06-13, e.g. "Holz").
  NOTE: the wuxing top-level `dominant_element` is the **western-vector** dominance; the fusion
  endpoint separately reports **eastern (bazi)** dominance ("Westliche Dominanz: Holz / Östliche
  Dominanz: Feuer"). Decide the convention in prompt design — do not invent. If wuxing is not
  called for a run, `dominant_element` → `PROMPT_VARIABLE_SOURCE_MISSING` (render-block).

**Reality-Ledger caveats (must be surfaced, never laundered):**
- `derivation_trace.day.day_anchor_evidence.anchor_verification = "unverified"` and
  `provenance_ids.day_anchor_id = "...jdn_2419451_unverified"` — the engine itself flags the
  **day-pillar anchor as unverified**. So "deterministic + verifiable chart math" holds for
  year/month/time resolution, but the day pillar carries a provider-declared unverified anchor.
- Determinism: two samples, identical input → identical `pillars` (only `computation_timestamp`
  differs). Supports the "deterministic chart calculation" half of the value promise.
- Interpretation fields (e.g. dayun `label_de`, `road_metaphor`) are FuFirE-generated meaning,
  NOT verifiable truth — bound by the canvas claim-discipline.

### POST /v1/calculate/wuxing — response (sample: `fufire-samples/wuxing.response.json`)

Top-level keys: `input`, `wu_xing_vector` (5 elements: Holz/Feuer/Erde/Metall/Wasser, l2-normalized),
`dominant_element` (string, e.g. "Holz" — argmax of the western vector), `equation_of_time`,
`true_solar_time`, `contribution_ledger.western[]`, `provenance`.

- `dominant_element` ← `dominant_element` (direct). `wu_xing_vector` available for richer prompts.
- Caveat: the standalone wuxing endpoint's vector is **western-planet-derived**. The bazi/fusion
  vectors differ; the `fusion` endpoint reconciles both (north-star, not this run).

### POST /v1/calculate/bazi/dayun — response (sample: `fufire-samples/bazi-dayun.response.json`)
Out of baseline scope. Structure: `dayun.{label, direction, start, cycles[], current}`, each cycle
`{ sequence, age_start, age_end, date_start, date_end, pillar{...}, relation_to_day_master{...}, is_current }`.

### Still MISSING (response side)
Real response samples now exist for **bazi + wuxing** (in scope) and dayun/fusion/vector-map
(north-star). No real samples yet for **`chronometry/resolve`** and **`bazi/trace`** — mapping for
those two stays **unverified** and must be marked as such in the Reality Ledger
(`integration-fake` / render-block until samples exist).

## Drift note vs. current code (to fix in Sprint 2)

`server/services/fufireDataService.ts` currently builds bodies like
`{ year: 2026, month: 6, day: 12, hour: 12 }` — **wrong**. Correct bodies per this contract:
combine birth date+time into the ISO `date` string, send flat fields for bazi/bazi_trace/wuxing
and the nested `birth` object for chronometry/resolve.
