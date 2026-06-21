# Product Vision — BaZi/Baci Solo No-Mock MVP
Feature-slug: bazi-baci-solo-no-mock-mvp
Status: user-confirmed (2026-06-21, ben.poersch@gmail.com; post-council)
Canvas: docs/canvas/bazi-baci-solo-no-mock-mvp.canvas.md
Source: Plumbline AgileTeam-Intake handover 2026-06-20 (SRC-H1); spec-sanity verified in-repo 2026-06-21.

## 1. Vision Statement
VIS-001 — EXPLICIT (Value-Line vom User bestätigt D-1)
Jedes ausgelieferte BaZi/Baci-Solo-Produkt trägt ausschließlich ECHTE, aus der realen
FuFire-Engine deterministisch abgeleitete chinesische Schriftzeichen — nie erfundene, nie
LLM-halluzinierte. Der No-Mock-Flow macht Korrektheit beweisbar: jedes Zeichen rückverfolgbar
zur Rohquelle. Operator produziert auditierbar; Endkäufer-Vertrauen (korrektes Zeichen auf
permanentem Produkt) ist der geschützte Wert.

## 2. Strategic Intent
| ID | Aussage | Status |
|---|---|---|
| VIS-002 | Auditierbarkeit IST das Produkt: jeder Artefakt-Zustand ist auf reale Engine-Daten + deterministische Mapper rückführbar. | EXPLICIT |
| VIS-003 | Ehrliches Blocken > stilles Fake: fehlt Key/Persistenz/Font/Verifikation, blockt der Flow sichtbar statt Mock zu liefern. | EXPLICIT |
| VIS-004 | LLM darf NUR Bild-Prompt-Prosa erzeugen, niemals finale Hanzi/Pinyin/Labels. | EXPLICIT |

## 3. Product Problem — EXPLICIT
Aktueller MVP-Pfad nutzt MockFuFireProvider/MockPod/MockMail (verifiziert: `src/lib/providers/mock.ts`,
injiziert `src/lib/app/appServices.ts:45`, genutzt `server/services/workflowRunService.ts`). Ein
Mock-Flow kann ein Produkt ausliefern, dessen Zeichen nie gegen die echte Engine geprüft wurden —
nicht verkaufstauglich. Auf permanentem Druck ist ein falsches Hanzi irreversibler Schaden.

## 4. Target Users
| Persona | Bedarf | Status |
|---|---|---|
| Operator/Betreiber | reproduzierbarer, auditierbarer Order→Ship-Lauf | EXPLICIT (D-1) |
| Endkäufer des Drucks | garantiert korrekte Zeichen auf permanentem Produkt | EXPLICIT (D-1) |

## 5. Value Proposition
| ID | Value | Status |
|---|---|---|
| VIS-005 | Korrektheits-Garantie: kein halluziniertes Zeichen erreicht je ein Produkt. | EXPLICIT (D-1) |
| VIS-006 | Beweisbare Provenienz: jeder Token → Rohpfad oder deterministisches Static-Label. | EXPLICIT |
| VIS-007 | Fail-closed: lieber sichtbar BLOCKED als stiller Fake. | EXPLICIT |

## 6. Non-Goals — EXPLICIT
Volle Etsy-Prod-Integration · automatischer POD-Versand · genereller Workflow-Redesign · volles
Four-Pillars-Interpretationsprodukt · Billing/Subscription.

## 7. What would count as a wrong/harmful implementation
Ein Mock/Stub nach Order-Intake der ungeprüfte Zeichen ausliefert · ein LLM/Bildmodell das finale
Hanzi/Pinyin erzeugt · ein erfundener FuFire-Endpunkt · „Ready" gemeldet ohne dass alle Gates real
PASS sind · real-boundary-Erfolg behauptet bevor der echte Key in Sizhu-Staging auflöst.

## 8. How we know the Vision is fulfilled
Ein dokumentierter Request fährt den BaZi-Solo-Flow in Staging mit echtem FuFire-Key und erzeugt
ENTWEDER ein persistiertes `ready_for_shipping`-Artefakt (mit Codepoint-Manifest + Provenienz)
ODER einen deterministischen `BLOCKED`-Grund.

## 9. User Confirmation — NOT YET CONFIRMED (Confirm-Satz siehe unten)
Der Assistant darf diese Vision NICHT selbst bestätigen. Erst nach dem expliziten User-Satz:
`Ich bestätige, dass Product Canvas und Product Vision meine Absicht korrekt wiedergeben und als Grundlage für AgileTeam Planning verwendet werden dürfen.`
