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
| C3 | Canvas includes Smart Order AI; `docs/20` AI is future; Accuracy Over Automation | **SUPERSEDED 2026-07-31:** in scope, adapted — deterministic rule-based assistant, adds to cart only, never auto-places (`docs/22` CF-01/CF-02) |
| C4 | Canvas Pharmacy “Customer Orders” B2C; Foundation out-of-scope consumer delivery | **SUPERSEDED 2026-07-31:** in scope, adapted — local retail sales ledger (POS) + customer delivery routes; not a consumer marketplace (`docs/22` CF-05/CF-06) |
| C5 | Canvas Stockist manufacturer POs / mfr returns; Part 19 manufacturers/transfers | **SUPERSEDED 2026-07-31:** in scope, adapted — supplier procurement module with local supplier records; suppliers are not platform participants (`docs/22` CF-17) |
| C6 | Canvas Admin commission/ledger/settlements; Part 19 SaaS/marketplace commercial | **SUPERSEDED 2026-07-31:** in scope, adapted — derived read-only commission monitor + transactions register; documents stay the only financial truth (`docs/22` CF-22) |
| C7 | Canvas “Upgrade to Premium” / Subscription | **SUPERSEDED 2026-07-31:** in scope, adapted — plan tiers + UTR/proof upgrade requests, admin-approved, conveniences only (`docs/22` CF-23) |
| C8 | Order status label `confirmed`/`invoiced` in canvas vs PDD states | **Normalize to PDD** (`docs/10` Order states). Invoice is separate entity; show invoice linkage not Order=Invoiced as core status (UI may show secondary badge “Invoiced” derived) |
| C9 | `docs/18` primarily online; canvas settings toggle `offline:true` | **SUPERSEDED 2026-07-31:** toggle in scope as local-first indicator — the app is already fully local; no additional offline engine (`docs/22` CF-30) |
| C10 | Analytics as entity in `docs/8` vs “never source of truth” | Store only cache; recompute from sources |
| C11 | Glossary maps Part 6 to files `6 / 7` | Confirms missing file 7; App Overview = Part 1 |

---

## 3. Explicit Out of Scope — REVISED 2026-07-31

**User directive:** nothing that exists in the canvases is skipped/deferred; canvas features are adapted per `docs/22` (see PLAN/01 §O + PLAN/14). What remains genuinely out of scope:

- Clinical/patient/doctor/Rx/insurance/lab/hospital ERP/manufacturing operations (not in canvases)  
- Real external integrations: SMS/email/payment gateways, OCR/AI services, maps APIs, Tally sync, 3PL, ABDM — each replaced by a defined local equivalent (`docs/22` exclusions table)  
- Open/public consumer marketplace with unauthenticated ordering (marketplace browse is in scope but connection-gated — CF-04; POS retail ledger is in scope — CF-05)  
- Full multi-warehouse allocation logic (locations-lite transfers are in scope — CF-33)  
- AI *authoritative* ordering (assistive rule-based suggestions in scope — CF-01)  
- Multi-currency; multi-device sync/backend; self-serve business merge  

---

## 4. Risks if Assumptions Wrong

| Risk | Mitigation |
|---|---|
| Real return window differs | Platform setting — no code change |
| Bill-ahead required by some stockists | Per-connection flag later; default safe OFF |
| Need true multi-user sync | Future backend; domain kernel reusable |
| Capability spec doc 7 appears later | Diff against services; adjust AC |

---

## 5. Confirmation Statements (historical) + status notes

1. *(original, 2026-07 plan)* No files under `docs/` were edited while producing the plan. **Note 2026-07-31:** `docs/22` (Part 21 addendum) was ADDED by user direction; Parts 1–20 remain untouched.  
2. Plan artifacts live under `PLAN/`.  
3. *(superseded)* “Implementation not started” — a build was executed and then audited on 2026-07-31; true status in `BUILD-STATUS.md` + `13-GAP-CLOSURE-PLAN.md`.

---

## 6. New Assumptions (2026-07-31)

| ID | Assumption |
|---|---|
| G21 | **Zero-state seed policy** (user directive): seed = 3 owner users + 3 Approved businesses + platformSettings + empty catalogue only; all demo data created through the UI. Supersedes the golden-path seed in PLAN/04 §5. Quick-login panel retained with the 3 credentials. |
| G22 | **Document-number counters derived at boot** from existing documents (no stored sequence); single-browser-tab assumption; re-hydrate + seedMeta stamp after workspace import. |
| G23 | **Canvas full-inclusion directive**: every canvas feature ships, adapted per `docs/22`; conflicts resolved by adaptation, never omission (PLAN/14 is the completeness ledger). Admin impersonation is IN scope as read-only + audited (reverses the earlier defer decision). Canvas seed data (SEED_VER 7 golden path) is overridden by G21. |
