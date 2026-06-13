# Product Canvas: sizhu-secure-fufire-baseline

Status: user-confirmed
Owner: requirements-analyst
Confirmed by user: yes
Canvas file: docs/canvas/sizhu-secure-fufire-baseline.canvas.md

> RE-CONFIRMED (2026-06-13, v1): Council-Punkte 2+3 übernommen, FuFirE-Request-Vertrag geliefert,
> vom User erneut bestätigt.
>
> **EVIDENCE UPDATE 2026-06-13 (v2, FINAL RE-CONFIRMED):** Der User lieferte reale RESPONSE-Samples
> für **bazi** und **wuxing** (+ dayun/fusion/vector-map als north-star-Referenz). Folgen:
> - **Sprint 4 teilweise un-deferred:** Response-Interpreter + Prompt-Mapper (REQ-F-002/F-003) kommen
>   zurück in-scope **für bazi + wuxing** (reale Samples vorhanden). `bazi_trace` + `chronometry/resolve`
>   Response-Mapping bleiben deferred (keine Samples) → fehlende Var = `PROMPT_VARIABLE_SOURCE_MISSING`.
> - **`dominant_element` gelöst:** ← `wuxing.dominant_element` (real, kein Erfinden, keine Heuristik).
>   Nuance: wuxing-Top-Level = westliche Dominanz; fusion trennt west/ost (Prompt-Design-Frage).
> - Fixtures: `docs/contracts/fufire-samples/{bazi,wuxing}.response.json` (+ dayun/fusion Referenz).
> - Vom User final re-confirmt 2026-06-13.

> The Product Canvas is a **mandatory pre-build value-alignment artifact**. `/agileteam`
> may not finalize the PRD or enter development until this canvas is filled in well
> enough, saved, linked to PRD/Vision/traceability, and **explicitly confirmed by the
> user**. It does not replace the PRD, Product Vision, traceability, Reality Ledger,
> Watcher, or human-acceptance gates — it sits in front of them.
>
> Allowed `Status` values: `draft` | `user-confirmed` | `blocked`. Development entry
> requires `Status: user-confirmed`. No agent may self-confirm the canvas. A
> product-critical field left at `MISSING` / `OPEN QUESTION` / `BLOCKER` blocks Phase 1.

> Scope-Hinweis: Dieses Canvas deckt ausschließlich die **Secure-FuFire-Baseline** ab
> (Quelle: User-Entscheidung 2026-06-13). Gelato-Realversand, Supabase-Persistenz,
> Etsy-Webhooks und die autonome Lernschleife (Sprints 6–8) sind north-star, NICHT in diesem Run.
>
> **User-Entscheidungen 2026-06-13 (Runde 2), in diesen Run eingearbeitet:**
> 1. **Sprint 4 deferred** (Response-Interpreter + Prompt-Mapper, REQ-F-002/003) — wegen fehlender
>    realer FuFire-RESPONSE-Samples; kommt in einen Folge-Run, sobald PII-bereinigte echte
>    Responses vorliegen. → Run = Sprints 0, 1-verifizieren, 2, 3, 5.
> 2. **UI im Scope** — Login/Account-Security-Views + FuFire-Test-Console-Transfer-UI
>    (`src/components/**`) gehören dazu.
> 3. **REQ-D-001 = nur sauber blockieren** — Production-Mode gibt explizit `SUPABASE_NOT_CONFIGURED`
>    zurück statt still auf Mock/localStorage zu fallen; KEINE reale Persistenz (Sprint 6 deferred).
> 4. **Rollenmodell owner/admin genügt** — keine neue admin-vs-operator-Differenzierung in diesem Run.
>
> **Council-Amendment 2026-06-13 (Phase 0.16, vom User adoptiert):**
> - **Punkt 5 → Entscheidung A:** Baseline-Scope bleibt; Demand-Pivot wird als *Sequenzierung*
>   absorbiert — SSRF-Fix (Sprint 3) zuerst und als eigenständig shippbarer Increment.
> - **Punkt 2 → erfüllt:** Der autoritative FuFirE-Request-Vertrag liegt vor
>   (`docs/contracts/fufire-api-reference.md`, OpenAPI-abgeleitet, User 2026-06-13). Sprint-2-Builder
>   werden gegen diesen Vertrag gebaut/getestet (Request-Seite jetzt `belegt`, nicht mehr `ungeprüft`).
>   RESPONSE-Schemas bleiben unbelegt → Sprint 4 bleibt deferred.
> - **Punkt 3 → übernommen:** Value-Promise geschärft (siehe Feld 4 + Claim-Disziplin in Feld 7).

---

## 1. Problem

What real problem should be solved?

Status: CONFIRMED

Answer:
Die Sizhu-Middleware hat heute zwei produktkritische Schwachstellen, die einen vertrauenswürdigen
Weg von der Etsy-Bestellung zur geprüften BaZi/Wu-Xing-Personalisierung verhindern:

1. **Konfig-Bypass / SSRF-Primitive.** Der generische Endpoint `POST /api/fufire/*` nimmt
   `baseUrl`, `fufirePath` und `apiKeySecretRef` AUS DEM REQUEST-BODY entgegen und ruft damit
   eine beliebige URL serverseitig auf (Quelle: Code server/index.ts:196–262). Dadurch kann ein
   Aufrufer das serverseitige FuFire-Vertragsmodell umgehen und steuern, wohin der Server mit
   dem FuFire-Secret requestet. Hinweis: Der Endpoint liegt mittlerweile HINTER `apiGuard`
   (Quelle: Code server/index.ts:59 vor :196), also nicht mehr öffentlich — aber das
   SSRF/Config-Bypass-Primitiv besteht für jeden authentifizierten Aufrufer weiter (REQ-A-001).
2. **Falsche FuFire-Request-Schemas.** Die aktuellen FuFire-Request-Bodies sind vereinfachte
   Platzhalter (z. B. `date`/`time` statt der dokumentierten verschachtelten
   `birth.*`-Struktur) und entsprechen NICHT den dokumentierten FuFire-Schemas
   (Quelle: Code server/services/fufireDataService.ts:112–120; Quelle: Sprint-Plan Sprint 2 Acceptance).
   Damit ist eine korrekte, nicht-erfundene Personalisierung nicht garantiert.

Übergeordnetes Produktproblem (Quelle: Vision.docx): SizhuAtelier braucht eine vollautomatische
Premium-Middleware, in der personalisierte Inhalte (BaZi / Four Pillars / Wu Xing) AUSSCHLIESSLICH
auf geprüften FuFire-Daten beruhen — keine erfundenen Geburts-/Element-/Tierkreisdaten — und in der
kein Backend-Zugriff öffentlich auslösbar ist.

---

## 2. Target user / customer

Who has this problem?

Status: CONFIRMED

Answer:
- **Primärer Nutzer (intern / Betreiber):** Der Betreiber/Admin von „SizhuAtelier", der die
  Middleware konfiguriert, FuFire-Test-Runs auslöst und Fulfillment freigibt
  (Quelle: Vision.docx; Quelle: Sprint-Plan REQ-S-002 admin/operator role + MFA/AAL2).
- **Endkunde (mittelbar):** Der Etsy-Käufer im Shop „SizhuAtelier", der ein personalisiertes
  Premium-Produkt erwartet, dessen BaZi/Wu-Xing-Inhalte korrekt und auf seinen echten
  Geburtsdaten basieren (Quelle: Vision.docx).

ENTSCHIEDEN (User 2026-06-13): Für diese Baseline genügt das bestehende **owner/admin**-Modell
(allowlisted Email → owner; sensible Routen verlangen admin-fähige Rolle + AAL2). Keine neue
admin-vs-operator-Differenzierung in diesem Run (REQ-S-002 bleibt darauf begrenzt).

---

## 3. Current workaround

How is the problem handled today?

Status: CONFIRMED

Answer:
- **Sicherheit:** `apiGuard` (Default-Deny auf allen `/api/*`-Routen außer `/`, `/assets/*`,
  `/api/health`) ist bereits ausgeliefert (Quelle: Code server/middleware/auth.ts:246; mount
  server/index.ts:59). Damit ist Sprint 1 weitgehend erledigt — der öffentliche Backend-Zugriff
  ist bereits geschlossen. Die generische Proxy-Route bleibt jedoch als Config-Bypass-Primitiv bestehen.
- **FuFire-Daten:** Es existiert ein Test-Run-Pfad (`POST /api/data-requests/fufire/test-run`,
  Quelle: Code server/index.ts:123) plus ein Service mit Default-Noon-Regel und
  `NO_GEOCODER_CONFIGURED`-Fehler (Quelle: Code server/services/fufireDataService.ts:13–46), aber
  mit falschen Request-Schemas. Reale FuFire-Antworten werden noch nicht real interpretiert.
- **Persistenz:** Supabase-Repositories sind Stubs, die kontrolliert `SUPABASE_OFFLINE_ERR` werfen
  (Quelle: Code src/lib/repositories/supabaseRepository.stub.ts:39ff). Reale Persistenz ist
  out-of-scope dieses Runs.
- **Fulfillment:** Gelato-Produktionsversand ist sicher durch `MISSING_POD_CONTRACT` blockiert
  (Quelle: Sprint-Plan Observed; Quelle: Code server/index.ts:156–187 pod/dispatch-Routen).
- **Modell-Gateway:** UI/Config tragen noch Gemini/OpenAI-Direktlabels und Secret-Refs als
  Defaults (Quelle: Sprint-Plan Observed/Sprint 5).

---

## 4. Value proposition

What concrete human/customer value will this create?

Status: CONFIRMED

Answer:
Eine sichere, testbare FuFire-First-Baseline schafft einen vertrauenswürdigen Pfad von
Etsy-Bestelldaten zu validierter BaZi/Wu-Xing-Personalisierung — OHNE Fake-Daten und OHNE
öffentlich/willkürlich auslösbaren Backend-Zugriff (Quelle: Sprint-Plan GOAL).

Konkreter Wert:
- **Betreiber:** kann FuFire-Operationen sicher und reproduzierbar auslösen; Pfad/baseUrl/
  Auth-Header/Secret sind serverseitig fixiert (REQ-A-001), nicht vom Client steuerbar; sensible
  Aktionen erfordern Rolle + MFA/AAL2 (REQ-S-001/002).
- **Endkunde:** erhält ausschließlich Personalisierung, die auf FuFirE-Daten beruht;
  fehlende/fehlerhafte Felder blockieren das Rendering oder geben kontrollierte Fehler zurück
  (REQ-F-002/003; absolute Kerngrenze laut Vision.docx).

**Geschärftes Value-Promise (Council-Punkt 3, User 2026-06-13):** Das Versprechen wird aufgespalten,
um einen Kategoriefehler zu vermeiden:
- Die **Chart-Berechnung** (Chronometrie → Vier Säulen / Wu Xing) ist deterministisch und
  *verifizierbar* — hier ist „korrekt, nicht erfunden" eine echte, prüfbare Aussage.
- Die **Interpretation/Deutung** ist FuFirE-generierte Ausgabe, nicht objektive Wahrheit. Es wird
  **nie** „verified truth" für die Deutung behauptet. Korrekte Formulierung: *„astronomisch akkurate
  Chart-Berechnung; Interpretation durch FuFirE."* Diese Disziplin bindet auch die QA-Gates: sie
  dürfen nur die *Berechnungs*-Korrektheit als „verifiziert" auszeichnen, nicht die Deutung.
- **Architektur:** OpenRouter als einziges Default-Modell-Gateway vereinfacht Secret-Management
  und richtet die Implementierung an der gewählten Architektur aus (REQ-A-002;
  Quelle: User-Entscheidung 2026-06-13).

---

## 5. Success signal

How will we know this is valuable?

Status: CONFIRMED

Answer:
Mess- bzw. prüfbare Signale (Quelle: Sprint-Plan Akzeptanzkriterien + Done-Definition):
- `/api/health` liefert 200 ohne Auth; `/api/data-requests/fufire/test-run` liefert 401/403
  ohne gültige Auth.
- FuFire-Request-Bodies für chronometry, bazi, bazi_trace und wuxing matchen in Unit-Tests die
  dokumentierten Schemas (aus Service-Output generiert, nicht als Literale).
- Der generische `/api/fufire/*`-Proxy ist entfernt/deaktiviert, mit Tests, die
  `fuFireConfig`/`fufirePath`/willkürliche-URL-Payloads ablehnen/ignorieren.
- OpenRouter ist Default-Gateway; keine erzwungenen Gemini/OpenAI-Direkt-Secrets in Default-UI/-Env.
- Supabase-Production-Modus nutzt nicht still localStorage/Mock-Provider.
- Gelato-Dispatch kann außerhalb des expliziten Demo-Modus keinen Fake-Erfolg erzeugen.
- `npm run lint`, `npm run build`, `npm test` bleiben grün; ein Verifikations-Log belegt das.

ENTSCHIEDEN (mit Canvas-Bestätigung): Für diese Baseline sind die **technischen Gate-Kriterien
oben das Erfolgsmaß**. Ein produktseitiges Outcome-Signal (z. B. „Betreiber löst N Test-Runs ohne
Fake-Daten-Vorfall aus") ist bewusst auf einen Folge-Run verschoben.

---

## 6. Core use case

What is the smallest meaningful use case?

Status: CONFIRMED

Answer:
Kleinster sinnvoller End-to-End-Pfad dieser Baseline (Quelle: Sprint-Plan Sprints 1–4):

Ein authentifizierter Admin/Operator (Rolle + MFA/AAL2 bei sensiblen Aktionen) löst einen
**FuFire-Test-Run** mit normalisierten Geburtsdaten aus
(`POST /api/data-requests/fufire/test-run`). Der Server
1. baut die FuFire-Request-Bodies serverseitig aus den dokumentierten Schemas (REQ-F-001),
2. ruft FuFire über serverseitig fixierten baseUrl/Pfad/Secret auf (kein client-gesteuerter
   Proxy, REQ-A-001) und gibt die rohe/sanitisierte Antwort kontrolliert zurück,
3. nutzt OpenRouter als Default-Modell-Gateway (REQ-A-002).

3. interpretiert die Antwort ohne Raten und mappt nur sichere Variablen — **für bazi + wuxing gegen
   reale Samples** (REQ-F-002/F-003): `animal` ← bazi.chinese.year.animal, `element` ←
   bazi.pillars.year.element, `birth_year` ← bazi.transition.solar_year, `dominant_element` ←
   wuxing.dominant_element. Fehlt eine Pflicht-Var → `PROMPT_VARIABLE_SOURCE_MISSING` + Render-Block.

**Teil-Deferral (EVIDENCE UPDATE 2026-06-13):** Response-Mapping für `bazi_trace` + `chronometry/resolve`
bleibt deferred (keine realen Samples). Die Kerngrenze „keine erfundenen Daten" bleibt aktiv: für nicht
belegte Operationen wird nichts gemappt, sondern blockiert/kontrolliert gefehlert.

Gelato bleibt blockiert (`MISSING_POD_CONTRACT`); reale Persistenz bleibt Stub/blockiert.

---

## 7. Non-goals

What should explicitly not be built?

Status: CONFIRMED

Answer:
(Quelle: Sprint-Plan „Explizit out-of-scope" + User-Entscheidung 2026-06-13)
- KEINE Etsy-Webhook-Automatisierung.
- KEIN realer Gelato-Order-/Draft-Versand, solange Gelato-Vertrag/Mapping nicht geliefert ist;
  Gelato bleibt `MISSING_POD_CONTRACT`-blockiert.
- KEINE autonome Prompt-Lern-Rückschreibung ohne menschliche Freigabe (Sprint 8 deferred).
- KEINE neue kostenpflichtige Provider-Abhängigkeit über die geplanten
  Supabase/FuFire/OpenRouter/Gelato hinaus.
- KEINE reale Supabase-Produktionspersistenz in diesem Run (Sprint 6 deferred); Production-Modus
  darf aber nicht still auf Mock/localStorage zurückfallen.
- KEINE QG2-Print-Readiness-/Gelato-Adapter-Implementierung (Sprint 7 deferred).
- KEIN Erfinden von BaZi-/Wu-Xing-/Tierkreis-/Element-/Geburtsdaten (absolute Kerngrenze,
  Quelle: Vision.docx) — gilt als Dauer-Constraint, nicht nur als Non-Goal.
- KEINE „verified truth"-Behauptung für die FuFirE-*Interpretation/Deutung* (Claim-Disziplin,
  Council-Punkt 3): nur die deterministische Chart-*Berechnung* darf als verifiziert ausgewiesen
  werden. Gilt für UI-Texte, Logs, Reports und die QA-Gate-Aussagen.

---

## 8. Risks / contradictions

What could make this wrong, useless, unsafe, misleading, too broad, or misaligned?

Status: CONFIRMED

Answer:
- **GELÖST durch Deferral (nicht durch Abschwächen) — fehlende reale FuFire-RESPONSE-Samples.**
  Ohne echte FuFire-Antwort-Beispiele lässt sich der Response-Interpreter + Prompt-Mapper
  (Sprint 4 / REQ-F-002, REQ-F-003) nicht real verifizieren (Quelle: Sprint-Plan MISSING). Der
  ursprüngliche BLOCKER wurde **durch User-Entscheidung 2026-06-13 aufgelöst, indem Sprint 4 aus
  diesem Run herausgenommen (deferred)** wurde — NICHT durch ein Abschwächen zu „bekannte
  Einschränkung". Sprint 4 kehrt erst zurück, wenn PII-bereinigte reale Samples vorliegen. Für
  diesen Run (Sprints 0–3, 5) besteht damit kein offener BLOCKER mehr.
- **BELEGT (war: ungeprüft) — FuFirE-REQUEST-Schemas.** Der autoritative OpenAPI-abgeleitete
  Request-Vertrag wurde vom User geliefert (`docs/contracts/fufire-api-reference.md`, 2026-06-13).
  Klassifikation der Request-Seite jetzt `belegt`. Korrektur ggü. Sprint-Plan-Annahme: `date` ist ein
  **ISO-DateTime-String**, `bazi`/`bazi_trace`/`wuxing` sind **flach** (nicht nested), `wuxing`
  verlangt `lat`/`lon` als required, nur `chronometry/resolve` nutzt das nested `birth`-Objekt.
  **Verbleibendes Risiko:** RESPONSE-Schemas sind weiterhin unbelegt (keine realen Samples) → die
  Antwort-Interpretation (Sprint 4) bleibt deferred; die Request-Builder (Sprint 2) sind jetzt real
  gegen den Vertrag verifizierbar.
- **Risiko — REQ-A-001 darf nicht zu „nur hinter Auth" abgeschwächt werden.** Der generische
  Proxy liegt bereits hinter `apiGuard` (Quelle: Code server/index.ts:59 vor :196). Es wäre falsch
  zu schließen, das Config-Bypass-/SSRF-Risiko sei damit erledigt — das Primitiv (Server fetcht
  beliebige body-gesteuerte URL mit Secret) muss entfernt/deaktiviert werden.
- **Risiko — Demo-Modus-Leckage.** Fake-Erfolg (Gelato/Persistenz) darf ausschließlich im
  expliziten `DEMO_LOCAL`-Modus möglich sein; Default-App-Mode ist DEMO_LOCAL (Quelle: Commit
  4980ee9). Gefahr: versehentlicher Fake-Erfolg im Production-Modus.
- **MISSING (nicht-blockierend für diesen Code-Scope):** exakte Railway-Env-Werte; Supabase
  First-Owner-User-ID und finales Auth-Key-Setup (Quelle: Sprint-Plan MISSING). Diese betreffen
  Deployment/Runtime, nicht primär den Code dieses Runs — müssen aber vor Live-Betrieb geklärt sein.
- **Contradiction-Check:** Keine direkten Widersprüche zwischen Vision.docx, Sprint-Plan und
  User-Entscheidung 2026-06-13 gefunden. Der einzige Spannungspunkt (FuFire-Schemas als Prämisse
  ohne unabhängigen Beleg) ist oben als `ungeprüft` markiert.

---

## 9. Evidence needed

What must be verified before implementation can be considered real?

Status: CONFIRMED

Answer:
Muss vorliegen/verifiziert sein, bevor der jeweilige Teil als „real" gilt:
1. **Reale FuFire-RESPONSE-Samples** (mind. je ein echtes Beispiel für chronometry, bazi,
   bazi_trace, wuxing) — Voraussetzung für REQ-F-002/REQ-F-003 (Sprint 4). **Sprint 4 ist in
   diesem Run deferred**, daher ist dieses Evidence-Item kein Blocker für diesen Run, sondern
   Eintrittsbedingung für den Sprint-4-Folge-Run.
2. **ERFÜLLT — FuFirE-REQUEST-Vertrag liegt vor** (`docs/contracts/fufire-api-reference.md`,
   OpenAPI-abgeleitet, User 2026-06-13). Sprint-2-Builder werden gegen diesen Vertrag verifiziert.
   Verbleibend: reale RESPONSE-Samples (Eintrittsbedingung für den deferreden Sprint 4).
3. **Verifikations-Log** mit grünem `npm run lint`, `npm run build`, `npm test` (Quelle:
   Sprint-Plan Done-Definition) — am Ende des Runs zu erbringen.
4. **Negativ-/Boundary-Tests** als Belege: 401/403 ohne Auth; abgelehnte/ignorierte
   `baseUrl`/`fufirePath`-Payloads; `PROMPT_VARIABLE_SOURCE_MISSING` bei fehlendem Feld; kein
   Fake-Erfolg außerhalb `DEMO_LOCAL`.
5. **Grep-/Checklist-Belege**: keine erzwungenen Gemini/OpenAI-Default-Secrets;
   `OPENROUTER_BASE_URL`/`OPENROUTER_API_KEY` nur serverseitig.

ENTSCHIEDEN (User 2026-06-13): Reale FuFire-Response-Samples liegen nicht vor → der Sprint-4-Anteil
wird **deferred** (statt als Schema-Stub gebaut). Für diesen Run sind die Evidence-Items 3–5
(Verifikations-Log, Negativ-/Boundary-Tests, Grep-/Checklist-Belege) maßgeblich; Item 2
(unabhängige Schema-Bestätigung) bleibt als Reality-Ledger-Vorbehalt für Sprint 2 markiert.

---

## Allowed change scope

List the only repo-relative files, directories, or glob patterns that implementation agents may edit for this feature. Keep this narrow and user-confirmed with the canvas. Examples: `src/<feature>/**`, `docs/<feature>.md`, `tests/<feature>/**`.

Status: CONFIRMED (User 2026-06-13 — UI eingeschlossen; 2026-06-13 erweitert um Workflow-/Governance-Artefakte nach Scope-Guard-Eskalation)

Allowed change scope:

- `server/index.ts`
- `server/middleware/**`
- `server/routes/**`
- `server/contracts/**`
- `server/services/**`
- `server/tests/**`
- `src/lib/auth/**`
- `src/lib/apiConnections/**`
- `src/lib/modelGateway/**`
- `src/lib/workflow/**`
- `src/lib/domain/**`
- `src/lib/repositories/**`
- `src/components/auth/**`
- `src/components/FuFireTestConsole.tsx`
- `src/components/fufire/**`
- `src/components/ConfigurationViews.tsx`
- `src/components/SettingsView.tsx`
- `src/components/ProductsView.tsx`
- `src/types.ts`
- `src/mockStorage.ts`
- `src/tests/**`
- `tests/**`
- `docs/canvas/**`
- `docs/prd/**`
- `docs/vision/**`
- `docs/contracts/**`
- `docs/plans/**`
- `docs/traceability.md`
- `docs/context/**`
- `docs/reality/**`
- `docs/architecture/**`
- `docs/deployment/railway.md`
- `.env.example`
- `package.json`
- `package-lock.json`

> ENTSCHIEDEN (User 2026-06-13): UI-Pfade für Login/Account-Security und FuFire-Test-Console sind
> Teil dieses Runs. Out-of-scope bleiben UI-Pfade zu deferred Sprints (Gelato/QG2,
> Supabase-Persistenz, Learning-Loop).
>
> SCOPE-CONSTRAINTS (gelten zusätzlich zu den Pfaden oben, parser-frei hier notiert):
> - `src/lib/repositories/**`: NUR Boundary / Production-Mode-Guard — KEINE reale Supabase-Persistenz.
> - `package.json` / `package-lock.json`: NUR Test-/Dev-Skripte + Dev-Dependencies — KEINE neue
>   Laufzeit-Provider-Dependency.
> - `docs/**`-Pfade sind Governance-/Workflow-Artefakte (Canvas, PRD, Vision, Traceability,
>   Plan, Contract-Referenz/Fixtures, Kontext/Marker, ADRs) — keine Produkt-Codepfade.
>
> ERWEITERUNG 2026-06-13 (Scope-Guard-Eskalation, vom User genehmigt): ergänzt um
> `docs/traceability.md`, `docs/plans/**`, `docs/contracts/**` (statt nur api-reference.md, deckt
> Sample-Fixtures), `docs/context/**` (GO-Marker/Run-Ledger), `docs/reality/**`,
> `docs/architecture/**`, `package-lock.json`; und der falsche Plan-Pfad
> `…-production-middleware-hardening.md` ersetzt durch `docs/plans/**` (Spec-Auditor-Befund N3).
> Formatierung parser-fest gemacht (Globs ohne Inline-Klammern).
>
> ERWEITERUNG 2026-06-13 (REQ-A-002 Scope-Shift = Option A, vom User genehmigt): ergänzt um
> `src/components/ConfigurationViews.tsx`, `src/components/SettingsView.tsx`,
> `src/components/ProductsView.tsx`, `src/types.ts`, `src/mockStorage.ts` — damit der OpenRouter-
> Gateway in den RUNTIME-Model-Pfad verdrahtet wird (Seed-Defaults + Typ-Union + UI-Labels), sodass
> REQ-A-002 wirklich wired-in-prod=yes wird (T5b). Constraint bleibt: KEINE neue Laufzeit-Provider-
> Dependency; OpenRouter server-side only. Default-Model-Slugs werden als `unverified` geführt
> (überschreibbar; vor Produktion gegen den OpenRouter-Live-Katalog zu bestätigen).

---

## 10. Traceability links

PRD: docs/prd/sizhu-secure-fufire-baseline.prd.md (geplant, noch nicht erstellt)
Product Vision: docs/vision/sizhu-secure-fufire-baseline.vision.md (geplant, durch product-owner)
Traceability Matrix: docs/prd/sizhu-secure-fufire-baseline.traceability.md (geplant)
Related REQ IDs (in-scope this run): REQ-S-001, REQ-S-002, REQ-F-001, REQ-F-002 (bazi+wuxing), REQ-F-003 (bazi+wuxing), REQ-A-001, REQ-A-002, REQ-D-001, REQ-O-001, REQ-O-002
Partly deferred (no samples): REQ-F-002/F-003 response-mapping for `bazi_trace` + `chronometry/resolve`
True-Line status: draft

---

## User confirmation

Confirmed by user: yes
Confirmation date: 2026-06-13
Confirmation note: Dreistufig final bestätigt durch User (ben.poersch@gmail.com). (1) Erstbestätigung. (2) Re-Confirm nach Council-Amendment (Punkte 2+3, Punkt 5→A; Request-Vertrag; Value-Promise + Claim-Disziplin). (3) Final-Confirm nach EVIDENCE UPDATE: reale bazi+wuxing-Response-Samples → Sprint 4 teil-reopened (bazi+wuxing), dominant_element ← wuxing gelöst. Canvas v2 ist die verbindliche Grundlage.
