# Doc-to-Plan Coverage Matrix

Every section of every source doc maps to plan artifacts. **PDD wins** over canvases.

---

## PDD Documents

| Doc path | Part | Sections covered in plan |
|---|---|---|
| `docs/App Overview` | 1 Foundation | `00` product def, principles, scope/out-of-scope; `01` in/out; `12` out-of-scope |
| `docs/2` | 2 Roles | `00` roles; `01` B/C/N; `02` portals; `05` permissions; `07` guards |
| `docs/3` | 3 Entities | `04` models; entity index → tables |
| `docs/4` | 4 Relationships & rules | `04` integrity; `05` machines/calcs; invariants |
| `docs/5` | 5 Capabilities | `01` full feature inventory A–N |
| `docs/6` | 6 Capability spec pattern | `01` §P; `05` Place Order as service template; gap noted |
| `docs/8` | 7 Entity specifications | `04` field-level schema; lifecycles; deletion/visibility |
| `docs/9` | 8 User journeys | `03` flows; `01` features; `10` journey gate |
| `docs/10` | 9 State machines | `05` §1 complete machine list + coupled effects |
| `docs/11` | 10 Calculations | `05` §2; `10` AC-O*; dashboards |
| `docs/12` | 11 Permissions | `05` §3; `07` usePermission; staff screens |
| `docs/13` | 12 Notifications | `08` catalogue; `05` §6; `10` AC-K* |
| `docs/14` | 13 Search/filter/export | `05` §7; `01` F-SEARCH/F-EXP; list screens in `03` |
| `docs/15` | 14 Dashboards & KPIs | `02` home IA; `03` home screens; `01` F-DASH-* |
| `docs/16` | 15 Edge cases | `05` §5; `03` policy defaults; `10` AC-P*/edges |
| `docs/17` | 16 Error behaviour | `05` §4; global states in `03` |
| `docs/18` | 17 NFRs | `00` stack/NFR; `06` a11y/mobile; `09` phase 8; offline position |
| `docs/19` | 18 Acceptance | `10` checklist expanded |
| `docs/20` | 19 Future expansion | `00`/`01`/`12` explicitly out of scope |
| `docs/21` | 20 Glossary | `08` language; naming; term distinctions |

---

## Missing Doc Handling

| Gap | Coverage approach |
|---|---|
| No `docs/1` file | `docs/App Overview` **is** Part 1 (confirmed by Glossary map) |
| No `docs/7` file | Capability specs incomplete; behaviour reconstructed from Parts 5+8–18 (`01` §P, `12` assumptions) |

---

## Design Canvases

| Artifact | Mapped to | Conflict handling |
|---|---|---|
| `index.html` | Brand font/redirect | Keep Lexend + accent |
| `DigiSwasthya.dc.html` | Auth UX, shared store pattern, seed, notifications wiring | Persist via Dexie not only localStorage; keep UX |
| `PharmacyPanel.dc.html` | Nav, screens, GRN, checklist | Drop B2C customer orders & Smart Order from v1 scope |
| `StockistPanel.dc.html` | Nav, fulfilment, catalogue | Drop manufacturer PO / mfr-returns / subscription |
| `PlatformAdmin.dc.html` | Approvals, network, banners | Drop commission ledger; map counterfeit→recall |

---

## Section-Level Completeness Claims

| PDD theme | Plan files |
|---|---|
| What product is | `00` |
| Who users are | `00`,`02`,`05` |
| What entities exist | `04` |
| What users can do | `01` |
| How journeys run | `03` |
| Legal state transitions | `05` |
| Money/stock math | `05`,`10` |
| Who may act | `05`,`07` |
| What alerts fire | `08` |
| Findability | `05`,`03` |
| KPIs | `02`,`03`,`01` |
| Exceptions | `03`,`05`,`10` |
| Errors | `03`,`05` |
| Quality | `00`,`06`,`09` |
| Pass/fail audits | `10` |
| Future boundary | `00`,`01`,`12` |
| Vocabulary | `08` |

---

## Addendum Coverage (2026-07-31)

| Source | Covered by plan file(s) |
|---|---|
| `docs/22` (Part 21 — Canvas-Derived Feature Specifications, NEW) | `01` §Q, `02` §7, `03` §H, `04` §§5+9, `05` §9, `07` §6, `08` §8, `10` §Q, `13`, `14` |
| Canvas: `PharmacyPanel.dc.html` (all 44 views + 9 modals) | `14` §1 (item-level), `13` Phases 6–7+11 |
| Canvas: `StockistPanel.dc.html` (all 70 inventory entries) | `14` §2, `13` Phases 3–5+12 |
| Canvas: `PlatformAdmin.dc.html` (21 views + 7 overlays) | `14` §3, `13` Phases 9+13 |
| Canvas: `DigiSwasthya.dc.html` + `index.html` (auth/wizard/shell) | `14` §4, `13` Phases 1+8+14 |

New plan files to keep in sync: **13-GAP-CLOSURE-PLAN.md** (living ledger — update statuses as items close) and **14-CANVAS-COVERAGE-MATRIX.md** (update "Now" column with 13). `BUILD-STATUS.md` is the summary only.
