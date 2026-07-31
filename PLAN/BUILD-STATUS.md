# DigiSwasthya Build Status

**App path:** `app/` (Vite + React + TypeScript SPA)  
**Updated:** 2026-07-31  
**Dev server:** http://localhost:5173/  
**Build:** `npm run build` succeeds  
**Unit tests:** `npm test` — 32 passed  
**E2E:** `npm run test:e2e` — Playwright Flow 1–5 + AC-L01 + invalid login — 7 passed  

Docs under `docs/` and design canvases (`*.dc.html`, root `index.html`) were **not modified**.

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

Fresh cache session used: killed node processes, wiped `node_modules/.vite` + `dist`, `npm cache clean --force`, `npm install`, then `npm run dev`.

---

## Demo credentials (OTP `123456`)

| Role | Email | Password |
|---|---|---|
| Platform Admin | `admin@digiswasthya.in` | `Admin@2026` |
| Stockist Owner | `vikram@medroute.in` | `Stockist@2026` |
| Stockist Manager / Accountant / Delivery Boy | `meera@` / `ravi@` / `amit@medroute.in` | `Stockist@2026` |
| Pharmacy Owner | `neha@careplus.pune.in` | `Pharmacy@2026` |
| Pharmacy Staff / Accountant | `priya@` / `suresh@careplus.pune.in` | `Pharmacy@2026` |
| Unverified Pharmacy | `kavita@greenleaf.pharmacy.in` | `Pharmacy@2026` |

Stakeholder walkthrough: `app/DEMO-SCRIPT.md`

---

## Phase completion

| Phase | Status | Notes |
|---|---|---|
| **0 Foundation** | Done | Vite/React/TS, tokens, AppShell, Dexie, seed v2, session + hydration gate |
| **1 Domain kernel** | Done | Machines, calc, permissions, audit, idempotency, policy clock |
| **2 Identity / verification / staff / admin** | Done | Register/login/OTP/invite, verification queue, suspend, staff, announcements, tickets, audit, settings |
| **3 Connections & catalogue** | Done | Discovery, lifecycle, catalogue CRUD + CSV import/export UI, cart, wishlist, price gates |
| **4 Orders & inventory** | Done | Place/accept/reject/cancel, FEFO allocate, pack, stock-in, movements, GRN, expiry guards |
| **5 Delivery & invoicing** | Done | Assign/OFD/deliver/fail/retry, invoice issue, overdue clock, double-bill block |
| **6 Payments, returns, credits** | Done | Submit/approve/reject, return window/qty, credit note issue/apply |
| **7 Communications / search / dashboards** | Done | N-001…N-060 catalog; messaging polish both sides; ListToolkit search/filter/sort/export/pagination on orders, catalogue, admin network/orders/payments; invoice overdue filter; AnalyticsDashboard with KPI drill-downs + outstanding reconciliation for Pharmacy/Stockist/Admin |
| **8 Edge hardening & NFR polish** | Done | Hydration before login; seed put/retry; auth toasts; mobile bottom nav; workspace export/import; policy clock; labelled inputs; empty filter states; concurrency/idempotency retained |
| **9 Acceptance sweep & demo pack** | Done | Expanded Vitest AC suite (O/N/H/F/K/permissions); Playwright Flows 1–5 + search/analytics; `DEMO-SCRIPT.md`; out-of-scope items still excluded |

---

## Explicitly not built (deferred)

- Smart Order AI  
- B2C customer orders  
- Manufacturer POs  
- Platform commission / ledger  
- Premium / Subscription  
- Real SMS/email/payment gateway  
- Full offline mode  

---

## Remaining (optional future)

- Playwright coverage of every AC checkbox in `10-ACCEPTANCE-CHECKLIST.md` (critical Flows 1–5 + core AC unit tests are automated; long-tail UI AC still manual)  
- Optional stress seed (thousands of products)  
- Bundle code-splitting for JS size warning  
