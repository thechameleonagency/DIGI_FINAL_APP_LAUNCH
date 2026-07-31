# Assumptions, Gaps & Contradictions

---

## 1. Documentation Gaps (Resolved with Assumptions)

| ID | Gap | Assumption for v1 build |
|---|---|---|
| G1 | `docs/7` missing — full Capability Specifications never written | Implement capabilities using Parts 5 + entity/journey/machine/calc/permission/edge/error/AC docs; use Place Purchase Order in `docs/6` as the specification pattern for every service |
| G2 | Many capabilities lack the full Part 6 template fields | Engineers derive Preconditions/Validation/Effects from entity rules + journeys + machines + edges |
| G3 | Partial fulfilment “future capability” wording in `docs/4` vs allowed in `docs/9`/`docs/10` | **Treat partial fulfilment as in-scope** for v1 (machines & journeys define it); deep backorder suite remains out (`docs/20` §6) |
| G4 | Return eligibility window “if exists” | Default **7 days** from delivery; configurable in platform settings |
| G5 | Invite TTL unspecified numerically | Default **7 days** |
| G6 | Pending order / payment / verification SLA durations unspecified | Defaults **24h / 48h / 72h** respectively; configurable |
| G7 | Credit note expiry policy optional | Default **disabled** (no auto-expire) |
| G8 | Payment proof mandatory “where configured” | Default **optional** |
| G9 | Bill-ahead invoicing | Default **OFF** (block invoice before dispatch) |
| G10 | In-flight orders on disconnect/suspend | See policy table in `03-SCREENS-AND-FLOWS.md` §F |
| G11 | Order close with open dues | Allow operational Close; keep invoice outstanding visible |
| G12 | FEFO | Auto-allocate earliest sellable expiry; Manager+ override with audit |
| G13 | Valuation cost for inventory value | Use batch `cost` if set else unit price snapshot |
| G14 | Intra vs inter-state GST | Compare Pharmacy vs Stockist state fields; missing state → treat as intra with warning |
| G15 | Demo auth OTP | Fixed `123456`; passwords hashed client-side only |
| G16 | No multi-device sync | Single browser profile; optional JSON workspace export/import |
| G17 | Client-only “concurrency” | Optimistic versioning / compare-and-swap in IndexedDB transactions within one origin |
| G18 | Policy clock when tab closed | Runs on focus/interval; may lag — acceptable for no-backend demo |
| G19 | Document binary storage | Store Blobs in IndexedDB `files` table; admin preview via object URLs |
| G20 | Catalogue “visibility rules” vague | Visible sellable products to pharmacies with **Active** connection only (plus public non-price profile for discovery) |

---

## 2. Contradictions Between Docs / Artifacts

| ID | Conflict | Resolution (binding) |
|---|---|---|
| C1 | `docs/4` Rel 7 lists partial fulfil as “future”; `docs/9`/`docs/10` define partial paths | **Follow journeys/state machines** — partial in scope |
| C2 | `docs/6` says “No workflow until every capability fully specified”; `docs/7` missing | **Proceed** using reconstructed specs; do not block build |
| C3 | Canvas includes Smart Order AI; `docs/20` AI is future; Accuracy Over Automation | **Out of scope** for v1 (flag-off). Do not auto-place orders |
| C4 | Canvas Pharmacy “Customer Orders” B2C; Foundation out-of-scope consumer delivery | **Out of scope** |
| C5 | Canvas Stockist manufacturer POs / mfr returns; Part 19 manufacturers/transfers | **Out of scope** |
| C6 | Canvas Admin commission/ledger/settlements; Part 19 SaaS/marketplace commercial | **Out of scope** — admin Money = read-only platform payments monitor + anomaly flags only |
| C7 | Canvas “Upgrade to Premium” / Subscription | **Out of scope** |
| C8 | Order status label `confirmed`/`invoiced` in canvas vs PDD states | **Normalize to PDD** (`docs/10` Order states). Invoice is separate entity; show invoice linkage not Order=Invoiced as core status (UI may show secondary badge “Invoiced” derived) |
| C9 | `docs/18` primarily online; canvas settings toggle `offline:true` | **No full offline mode**; connectivity error behaviour only |
| C10 | Analytics as entity in `docs/8` vs “never source of truth” | Store only cache; recompute from sources |
| C11 | Glossary maps Part 6 to files `6 / 7` | Confirms missing file 7; App Overview = Part 1 |

---

## 3. Explicit Out of Scope (Do Not Build as Product Truth)

From `docs/App Overview` §7 + `docs/20` — also strip from canvas port:

- Clinical/patient/doctor/Rx/insurance/lab/hospital ERP/manufacturing  
- Consumer marketplace / OTC B2C  
- Multi-warehouse, manufacturer trading, inter-stockist transfer  
- Payment gateway automation, Tally sync, 3PL integrations, ABDM  
- AI authoritative ordering  
- Multi-currency  
- Self-serve business merge  
- SaaS subscription entitlements / platform commission engine  

---

## 4. Risks if Assumptions Wrong

| Risk | Mitigation |
|---|---|
| Real return window differs | Platform setting — no code change |
| Bill-ahead required by some stockists | Per-connection flag later; default safe OFF |
| Need true multi-user sync | Future backend; domain kernel reusable |
| Capability spec doc 7 appears later | Diff against services; adjust AC |

---

## 5. Confirmation Statements

1. **No files under `docs/` were edited, modified, or deleted** while producing this plan.  
2. Plan artifacts live only under `PLAN/`.  
3. Implementation has **not** been started as part of this task.
