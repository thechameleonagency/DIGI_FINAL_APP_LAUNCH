# Build Phases & Milestone Order

Goal: ship the **full PDD-complete no-backend app**, not a thin slice. Phases sequence dependencies so domain integrity lands before UI breadth.

---

## Phase 0 — Foundation (Week 1)

**Deliverables**
- Vite + React + TS scaffolding  
- Design tokens + AppShell + auth layout  
- Dexie schema + seed + migrations  
- Domain stubs: types from `docs/8`, permission evaluator, error types  
- Session login against seed admin/pharmacy/stockist  

**Exit:** Three portals open with seed users; empty pages routable.

---

## Phase 1 — Domain Kernel (Week 2–3)

**Deliverables**
- All state machines (`docs/10`) with unit tests for allowed/forbidden  
- All calculations (`docs/11`) with AC-O* numeric tests  
- Audit log writer  
- Idempotency helper  
- Policy clock (expiry, overdue)  

**Exit:** Pure domain tests green; no UI dependency.

---

## Phase 2 — Identity, Verification, Staff, Admin Governance (Week 3–4)

**Deliverables**
- Register wizard + verification submit  
- Admin verification queue (approve/reject/request docs)  
- Suspend/reactivate/deactivate  
- Staff invite/accept/roles/remove/transfer ownership  
- Announcements, banners, platform settings  
- Support tickets both sides  
- Audit browser  

**Exit:** AC-A*, AC-B*, AC-C*, AC-M* critical paths pass.

---

## Phase 3 — Connections & Catalogue (Week 4–5)

**Deliverables**
- Discovery search/filter  
- Connection lifecycle + notifications N-010…015  
- Stockist catalogue CRUD, import/export  
- Pharmacy browse/compare/wishlist/cart (pre-order)  
- Pricing visibility gates  

**Exit:** AC-D*, AC-E01; disconnected cannot see private price.

---

## Phase 4 — Orders & Inventory Core (Week 5–7)

**Deliverables**
- Place order (full `docs/6` Place Purchase Order behaviour)  
- Accept/reject/cancel/edit rules  
- Batch stock, reservations, FEFO allocate, pack  
- Movement ledger; negative/expired guards  
- Pharmacy inventory + GRN path (receive without payment)  

**Exit:** AC-E02–E09, AC-J*, AC-F01, AC-F06–F07.

---

## Phase 5 — Delivery & Invoicing (Week 7–8)

**Deliverables**
- Delivery entity + assignment + Delivery Boy board  
- Partial/failed/retry  
- Invoice issue from billable qty; overdue job; void rules  
- Immutability + double-bill block  

**Exit:** AC-F02–F05, AC-F08, AC-G*.

---

## Phase 6 — Payments, Returns, Credits (Week 8–9)

**Deliverables**
- Payment submit/allocate/approve/reject/hold + duplicate detection  
- Returns eligibility → approve/reject → goods back → disposition  
- Credit note issue/apply  
- Settlement recompute  

**Exit:** AC-H*, AC-I*.

---

## Phase 7 — Communications, Search, Dashboards (Week 9–10)

**Deliverables**
- Full notification catalog N-001…N-060  
- Messaging threads  
- All list search/filter/sort/export (`docs/14`)  
- All dashboards/KPIs (`docs/15`) with drill-downs  
- Analytics stale/recompute  

**Exit:** AC-K*, AC-L*; dashboard outstanding matches invoice sum.

---

## Phase 8 — Edge Hardening & NFR Polish (Week 10–11)

**Deliverables**
- Automate `docs/16` E-* priority set  
- Concurrency/double-submit  
- Mobile layouts for Delivery Boy + GRN + notifications  
- Accessibility pass  
- Workspace export/import  
- Performance: pagination on large seed (thousands of products stress seed optional)  

**Exit:** `docs/18` §18 release bar met.

---

## Phase 9 — Acceptance Sweep & Demo Pack (Week 11–12)

**Deliverables**
- Expand AC coverage per `10-ACCEPTANCE-CHECKLIST.md`  
- Playwright golden path script (Flow 1–5 in screens doc)  
- Demo script document for stakeholders  
- Remove/hide out-of-scope canvas leftovers  

**Exit:** Product-complete relative to PDD current scope.

---

## Parallel Workstreams

| Stream | Owner focus |
|---|---|
| Domain/tests | Phases 1, 4–6 integrity |
| Pharmacy UI | Phases 3–7 |
| Stockist UI | Phases 3–7 |
| Admin UI | Phase 2, 7 |
| Design system | Phase 0 continuous |

---

## Dependency Graph (Simplified)

```
Kernel → Auth/Verify/Staff → Connections → Catalogue/Cart
    → Orders+Inventory → Delivery+Invoice → Payments+Returns
    → Notifications+Dashboards → Edges/AC
```

---

## Post-Audit Addendum (2026-07-31)

Phases 0–9 above were executed once; the 2026-07-31 audit found **every phase Partial** (details in `BUILD-STATUS.md`). The active plan of record for sequencing is now **[13-GAP-CLOSURE-PLAN.md](./13-GAP-CLOSURE-PLAN.md)**:

- Gap Phases 1–10 close the audited gaps (seed reset to zero-state per PLAN/04 §5, verified bug fixes, shared foundations, per-portal completion, permission gating, notifications, tests).
- Gap Phases 11–14 deliver the canvas-derived modules CF-01…CF-39 specified in `docs/22`, with the completeness guarantee in `14-CANVAS-COVERAGE-MATRIX.md`.

Exit criteria per gap phase live in file 13; AC gates extended by PLAN/10 §Q. This file's Phase 0–9 definitions remain useful as the original scope reference — do not re-plan against them.
