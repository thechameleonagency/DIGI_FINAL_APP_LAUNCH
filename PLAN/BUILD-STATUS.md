# DigiSwasthya Build Status

**App path:** `app/` (Vite + React + TypeScript SPA)
**Updated:** 2026-07-31 (full audit reconciliation — see below)
**Dev server:** http://localhost:5173/
**Build:** `npm run build` succeeds
**Unit tests:** `npm test` — 32 passed (pure-domain suites)
**E2E:** `npm run test:e2e` — 7 passed (golden path Flows 1–5 + AC-L01 + invalid login)

Docs under `docs/` and design canvases (`html/*.dc.html`) are reference-only and were **not modified**, except the addition of the new addendum `docs/22` (Part 21 — Canvas-Derived Feature Specifications).

---

## ⚠ Status correction (2026-07-31)

An exhaustive audit (all 20 PDD docs + all 4 design canvases + full source cross-check) found that the previous version of this file **overstated completion**. The core golden path works end-to-end, but **each phase below is Partial, not Done** — roughly half of the specified application (screens, sub-flows, modals, edge-case UI, permission gating, notification emitters, and all canvas-derived modules) is missing or partial, and 8 concrete bugs were verified in source.

- **Authoritative gap ledger & build sequencing:** [13-GAP-CLOSURE-PLAN.md](./13-GAP-CLOSURE-PLAN.md) (~130 audited work items + canvas-derived feature modules, phased).
- **Canvas completeness guarantee:** [14-CANVAS-COVERAGE-MATRIX.md](./14-CANVAS-COVERAGE-MATRIX.md) — every screen/modal/action in the 4 HTML canvases mapped to a plan item. **Nothing is skipped, removed, or deferred**; canvas features that conflicted with PDD rules are adapted (see `docs/22` + PLAN/12), and only real external integrations (SMS/email/payment gateways, real OCR/AI, maps APIs, multi-device sync) are replaced by local/simulated equivalents.
- **No code has been changed during this reconciliation** — documentation only. Development resumes at PLAN/13 Phase 1.

---

## How to run

```bash
cd app
npm install
npm run dev          # http://localhost:5173
npm run build
npm test             # domain + AC unit tests
npm run test:e2e     # Playwright golden path
```

---

## Demo credentials — current build (seed v2, OTP `123456`)

The currently deployed seed still creates the rich demo dataset (4 businesses, 10 users, products, orders, invoices):

| Role | Email | Password |
|---|---|---|
| Platform Admin | `admin@digiswasthya.in` | `Admin@2026` |
| Stockist Owner | `vikram@medroute.in` | `Stockist@2026` |
| Stockist Manager / Accountant / Delivery Boy | `meera@` / `ravi@` / `amit@medroute.in` | `Stockist@2026` |
| Pharmacy Owner | `neha@careplus.pune.in` | `Pharmacy@2026` |
| Pharmacy Staff / Accountant | `priya@` / `suresh@careplus.pune.in` | `Pharmacy@2026` |
| Unverified Pharmacy | `kavita@greenleaf.pharmacy.in` | `Pharmacy@2026` |

**Planned (PLAN/13 Phase 1 — seed v3 zero-state):** all dummy data deleted; exactly **3 accounts** (admin / vikram / neha rows above), zero business data, quick-login panel retained showing those 3 credentials. See PLAN/04 "Seed dataset (zero-state)".

---

## Phase status (audited)

| Phase | Status | What works / what is missing (summary — full detail in PLAN/13) |
|---|---|---|
| **0 Foundation** | Partial | Vite/React/TS, tokens, AppShell, Dexie, seed, session gate work. Missing: mobile nav drawer (hamburger dead — most pages unreachable on mobile), persistent doc-number counters (numbers repeat after reload). |
| **1 Domain kernel** | Partial | Machines, calc, permissions, audit, idempotency, policy clock exist. Missing: `useSession().can` has **zero UI call sites**; several services lack `assertCan`; many calc helpers (`gstSplit`, `pairOutstanding`, `lowStock`) never called. |
| **2 Identity / verification / staff / admin** | Partial | Register/login/OTP/invite/verification queue/suspend work. Missing: wizard validation + document upload, resubmission UI (`submitVerification` orphaned), rejection reasons never shown, staff lifecycle beyond invite (role change/suspend/remove/transfer), change-password, profile pages, session TTL, failed-attempt lockout. |
| **3 Connections & catalogue** | Partial | Discovery, request/approve/reject, catalogue CRUD + CSV import, cart, wishlist, price gates work. Missing: block/unblock, credit terms at approval, product edit/deactivate, catalogue status, bulk price update, product detail/compare, stockist detail, per-pair derived data. |
| **4 Orders & inventory** | Partial | Place/accept/reject/cancel(pharmacy), FEFO allocate, pack, stock-in, GRN, expiry guards work. **Bug:** GRN double-counts stock on repeat submit. Missing: partial acceptance/delivery UI (services exist), batch-override UI, stockist cancel/close order UI, checkout step, reorder, adjustments/movement history/low-stock/expiry views, quarantine/recall. |
| **5 Delivery & invoicing** | Partial | Assign/OFD/deliver/fail/retry, invoice issue, overdue clock, double-bill block work. Missing: partial delivery, POD, fail-reason input, returned-to-stockist restock, routes, invoice detail/void/print, delivery address/contact on cards. |
| **6 Payments, returns, credits** | Partial | Submit/approve/reject, return window/qty, CN issue/apply work. **Bug:** mixed-stockist allocation mis-targets. Missing: payment proof upload (dead-end if proof mandatory), On-Hold UI, payment detail/review modal, goods-received-back + disposition→inventory, CN chooser/detail/void, partial return approval. |
| **7 Communications / search / dashboards** | Partial | Notification catalog, messaging UI, ListToolkit on some lists, analytics dashboards exist. **Bug:** messages send to wrong counterpart. Missing: ~20 notification emitters, deep-link click-through, mark-read for stockist/admin (badges never clear), announcements targeting/fan-out/expiry, banners render nowhere, global search, most docs/15 dashboard cards/graphs/drill-downs, role-variant dashboards. |
| **8 Edge hardening & NFR** | Partial | Hydration gate, seed retry, idempotent place-order/payment, some empty states. Missing: ~16 bare lists at zero data, confirmation dialogs app-wide (2 modals in entire app), hardcoded decision reasons, busy states on most buttons, format validations (GSTIN/phone/PIN), duplicate phone/DL checks. |
| **9 Acceptance & demo pack** | Partial | 32 unit + 7 e2e tests pass but cover a fraction of the 125-item AC checklist (PLAN/10 reconciled: only evidence-backed items checked). DEMO-SCRIPT tied to rich seed (to be rewritten with seed v3). |
| **11–14 Canvas-derived modules (PLAN/13)** | Not started | Smart Order, Quick Order, Compare Prices, Marketplace, POS/customer sales, QR bill verification, supplier procurement, delivery routes, offline-payment recording, reminders, bulk billing, commissions monitor, premium plans, OTC partnership, counterfeit management, impersonation (read-only), reports hubs, help center, onboarding — now specified in `docs/22` and sequenced in PLAN/13 Phases 11–14. |

---

## Excluded (local/simulated equivalents specified in docs/22)

Only genuine external integrations are excluded from the local build — each has a defined local equivalent:

- Real SMS/email/OTP gateway → fixed demo OTP, in-app notifications
- Real payment gateway → manual payment + proof + approval workflow
- Real OCR / AI services → deterministic text-parse and rule-based suggestion equivalents (Quick Order, Smart Order, bill quick-entry)
- Real maps APIs → address deep-links to Google Maps URLs
- Multi-device sync / backend → single-browser Dexie + workspace export/import

Everything else that appears in the PDD or the canvases is in scope. See PLAN/14 for the item-by-item guarantee.
