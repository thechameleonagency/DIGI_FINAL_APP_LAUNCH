# DigiSwasthya — Complete Build Plan (No Backend)

**Status (updated 2026-07-31):** Build executed once, then fully audited — every original phase is Partial; the active plan of record is [13-GAP-CLOSURE-PLAN.md](./13-GAP-CLOSURE-PLAN.md) (see `BUILD-STATUS.md` for honest status)  
**Product:** DigiSwasthya B2B pharmaceutical commerce & operations platform  
**Constraint:** Client-side only (local/mock/static data; no server API)  
**Authority:** PDD Parts 1–20 in `docs/` + **Part 21 addendum `docs/22`** (canvas-derived feature specs) are the source of truth. Design canvases (`.dc.html`) are binding for feature/flow coverage — **nothing in them is skipped or deferred** (user directive 2026-07-31; adaptations specified in `docs/22`, item-by-item guarantee in [14-CANVAS-COVERAGE-MATRIX.md](./14-CANVAS-COVERAGE-MATRIX.md)); PDD principles prevail on conflicts via adaptation, never omission.  
**Seed policy (user directive):** zero-state seed — exactly 3 users (1 per role), no business data, quick-login panel retained (PLAN/04 §5, PLAN/12 G21).

---

## 1. What We Are Building

DigiSwasthya enables **verified Pharmacies** and **verified Stockists** to manage their full B2B trade relationship digitally: discovery → connection → catalogue → order → fulfil → deliver → invoice → pay → return → credit note → analytics — with **Platform Administrator** governance (verification, suspension, support, announcements, audit).

Success (from `docs/App Overview`): a pharmacy and stockist complete onboarding → settlement **without WhatsApp, spreadsheets, or paper**.

---

## 2. Plan File Index

| File | Contents |
|---|---|
| [00-MASTER-PLAN.md](./00-MASTER-PLAN.md) | This overview, stack, architecture, principles |
| [01-FEATURE-INVENTORY.md](./01-FEATURE-INVENTORY.md) | Exhaustive features mapped to source docs |
| [02-INFORMATION-ARCHITECTURE.md](./02-INFORMATION-ARCHITECTURE.md) | Navigation maps for all three portals |
| [03-SCREENS-AND-FLOWS.md](./03-SCREENS-AND-FLOWS.md) | Every screen + user journeys + edge paths |
| [04-DATA-MODELS-PERSISTENCE.md](./04-DATA-MODELS-PERSISTENCE.md) | Entities, schemas, IndexedDB/localStorage |
| [05-DOMAIN-RULES.md](./05-DOMAIN-RULES.md) | State machines, calculations, permissions, errors |
| [06-UI-DESIGN-SYSTEM.md](./06-UI-DESIGN-SYSTEM.md) | Design tokens, components, UX rules |
| [07-ROUTING-STATE-COMPONENTS.md](./07-ROUTING-STATE-COMPONENTS.md) | Routes, state management, component inventory |
| [08-CONTENT-ASSETS-NOTIFICATIONS.md](./08-CONTENT-ASSETS-NOTIFICATIONS.md) | Copy, N-001…N-060, assets |
| [09-BUILD-PHASES.md](./09-BUILD-PHASES.md) | Milestone order for full app |
| [10-ACCEPTANCE-CHECKLIST.md](./10-ACCEPTANCE-CHECKLIST.md) | Per-feature AC (from Part 18 + expansion) |
| [11-DOC-COVERAGE-MATRIX.md](./11-DOC-COVERAGE-MATRIX.md) | Every doc section → plan item |
| [12-ASSUMPTIONS-CONTRADICTIONS.md](./12-ASSUMPTIONS-CONTRADICTIONS.md) | Gaps resolved + PDD vs canvas conflicts (C3–C9 superseded 2026-07-31) |
| [13-GAP-CLOSURE-PLAN.md](./13-GAP-CLOSURE-PLAN.md) | **Plan of record**: audited gap ledger (~130 items) + canvas modules CF-01…CF-39, phased 1–14 |
| [14-CANVAS-COVERAGE-MATRIX.md](./14-CANVAS-COVERAGE-MATRIX.md) | Every canvas screen/modal/action → plan item (zero deferred) |
| [BUILD-STATUS.md](./BUILD-STATUS.md) | Honest current status summary |

---

## 3. Source Documents Read (Complete Set)

### PDD (authoritative product language)

| Part | Path | Title |
|---|---|---|
| 1 | `docs/App Overview` | Product Foundation |
| 2 | `docs/2` | User Roles & Responsibilities |
| 3 | `docs/3` | Business Entities |
| 4 | `docs/4` | Business Relationships & Business Rules |
| 5 | `docs/5` | User Capabilities |
| 6 | `docs/6` | Capability Specifications (structure + Place Purchase Order example) |
| 7 | **MISSING** | Intended continuation of Capability Specs (per Glossary map) |
| 7/Entity Specs | `docs/8` | Entity Specifications (numbered file 8 = PDD Part 7) |
| 8 | `docs/9` | User Journeys |
| 9 | `docs/10` | State Machines |
| 10 | `docs/11` | Business Calculations |
| 11 | `docs/12` | Permissions Matrix |
| 12 | `docs/13` | Notifications |
| 13 | `docs/14` | Search, Filtering, Sorting & Export |
| 14 | `docs/15` | Dashboards & KPIs |
| 15 | `docs/16` | Edge Cases & Exception Handling |
| 16 | `docs/17` | Error Behaviour |
| 17 | `docs/18` | Non-Functional Requirements |
| 18 | `docs/19` | Acceptance Criteria / Audit Specification |
| 19 | `docs/20` | Future Expansion (**out of scope for v1 build**) |
| 20 | `docs/21` | Product Glossary |

### Design / prototype artifacts (UI reference only)

| Path | Role |
|---|---|
| `index.html` | Redirect shell → DigiSwasthya canvas |
| `DigiSwasthya.dc.html` | Auth, registration, shell, shared localStorage store |
| `PharmacyPanel.dc.html` | Pharmacy portal UI prototype |
| `StockistPanel.dc.html` | Stockist portal UI prototype |
| `PlatformAdmin.dc.html` | Admin portal UI prototype |

**Note:** No production SPA codebase exists yet — only docs + HTML canvases using `localStorage`.

---

## 4. Tech Stack Recommendation (No-Backend SPA)

Grounded in existing canvases (vanilla HTML + localStorage) but upgraded for maintainability of a PDD-complete domain layer.

| Layer | Choice | Rationale |
|---|---|---|
| App type | **Single SPA** with three role portals + shared domain | Matches canvases; one deployable static app |
| Framework | **React 18 + TypeScript + Vite** | Strong typing for entities/state machines; team-friendly SPA |
| Routing | **React Router v6/v7** | Role-gated route trees |
| Client state | **Zustand** (session/UI) + **domain store service** | Clear split: UI state vs authoritative entity store |
| Persistence | **IndexedDB via Dexie.js** (primary) + `localStorage` session keys | Orders/invoices/history exceed comfortable localStorage size; canvases already prove local store pattern |
| Seed / mock | Static seed JSON + seed version migration (like `SEED_VER` in canvas) | Demo-ready pharmacy↔stockist↔admin loop |
| Forms | React Hook Form + Zod | Validation maps to PDD validation/error categories |
| Tables/lists | TanStack Table (optional) or custom list primitives | Search/filter/sort per Part 13 |
| Charts | Recharts | Dashboard KPIs Part 14 |
| Icons | Lucide React | Already used in canvases |
| Fonts | **Lexend** (from `index.html` / canvas CSS) | Existing brand signal |
| Styling | CSS variables design tokens (port from canvas `--ds-*`) + modular CSS or Tailwind if preferred | Keep accent `#4A7399`, page `#fafafa` |
| Exports | Client-side CSV/JSON download | Part 13 export rules |
| File uploads | File → Object URL / base64 in IndexedDB (mock docs/proof) | No upload server |
| Auth | Client-only accounts in IndexedDB; session in `sessionStorage`/`localStorage` | Password hashed with Web Crypto (SHA-256 + salt) for demo realism — **not production security** |
| Testing | Vitest (domain/calculations/state machines) + Playwright (critical journeys) | AC Part 18 must be automatable |
| Hosting | Static hosting (any CDN / GitHub Pages / Netlify) | No backend |

### Explicit non-choices for v1 (no-backend)

- No REST/GraphQL server, no Firebase, no Supabase, no real SMS/email/OTP gateway (OTP simulated).
- No real payment gateway (manual payment + proof + stockist approve — PDD current model).
- No multi-device sync (same browser profile = source of truth). Optional: export/import workspace JSON for demo handoff.

---

## 5. Architecture (No-Backend)

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer (React portals)                                   │
│  AuthShell │ PharmacyApp │ StockistApp │ AdminApp           │
└───────────────────────────┬─────────────────────────────────┘
                            │ commands / queries
┌───────────────────────────▼─────────────────────────────────┐
│  Application Services                                       │
│  AuthService · VerificationService · ConnectionService      │
│  CatalogueService · CartService · OrderService              │
│  FulfilmentService · DeliveryService · InvoiceService       │
│  PaymentService · ReturnService · CreditNoteService         │
│  InventoryService · NotificationService · MessageService    │
│  SupportService · AnalyticsService · ExportService          │
│  AdminGovernanceService · AuditService                      │
└───────────────────────────┬─────────────────────────────────┘
                            │ enforce
┌───────────────────────────▼─────────────────────────────────┐
│  Domain Kernel                                              │
│  StateMachines · Calculations · Permissions · Invariants    │
│  IdGenerators · Clock · EventBus (in-process)               │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Persistence (Dexie / IndexedDB)                            │
│  businesses users verifications connections products        │
│  batches inventoryMovements orders invoices payments        │
│  deliveries returns creditNotes notifications messages      │
│  tickets announcements banners auditLogs settings seedMeta  │
└─────────────────────────────────────────────────────────────┘
```

### Core runtime rules

1. **All mutations go through domain services** — UI never writes raw entity status jumps.
2. **EventBus** after successful commit emits domain events → NotificationService (N-001…N-060) + derived analytics invalidation.
3. **Notification failure never rolls back** primary commit (`docs/17`, `docs/18`).
4. **Idempotency keys** on Place Order / Submit Payment / Approve actions (`docs/16` E-N*, `docs/17`).
5. **Single source of truth:** invoices/orders/payments beat dashboard caches (`docs/3`, `docs/15` E-M01).

### Multi-role demo model (same browser)

Shared IndexedDB holds all tenants. Login selects a User → Business → portal. Pharmacy and Stockist see the **same** Order/Invoice/Payment records (synchronized by identity), matching PDD “Single Source of Truth”.

---

## 6. Product Principles (Must Enforce in Code)

From `docs/App Overview` + `docs/4` + Glossary:

1. Verification before trade  
2. Active Connection required to order / see private pricing  
3. Orders ≠ invoices ≠ payments  
4. Messages/notifications never approve anything  
5. Inventory never negative; expired/recalled/quarantined not sellable  
6. Issued financial documents immutable in substance  
7. User deletion never deletes business history  
8. Accuracy over automation  

---

## 7. In Scope vs Out of Scope

### In scope (FULL v1 build — everything PDD supports now)

All capabilities in `docs/5`, journeys in `docs/9` (A–R), entities in `docs/8`, state machines in `docs/10`, calculations in `docs/11`, permissions in `docs/12`, notifications in `docs/13`, search/export in `docs/14`, dashboards in `docs/15`, edge cases in `docs/16`, error behaviour in `docs/17`, NFRs applicable to client-only in `docs/18`, AC in `docs/19`.

### Out of scope — REVISED 2026-07-31

**User directive:** every canvas feature ships (adapted per `docs/22`; ledger in PLAN/13 Phases 11–14; guarantee in PLAN/14). Genuinely out of scope now only:

- Patient / doctor / e-Rx / clinical / hospital ERP / insurance / lab / manufacturing ops (not in canvases)  
- Real external integrations — SMS/email/payment gateways, OCR/AI services, maps APIs, accounting sync, 3PL, ABDM — each with a defined **local equivalent** (`docs/22` exclusions table)  
- Open/public consumer e-commerce with unauthenticated ordering (marketplace browse is in scope, connection-gated — CF-04; POS retail ledger in scope — CF-05)  
- Full multi-warehouse allocation (locations-lite transfers in scope — CF-33)  
- AI as *authoritative* automation (assistive deterministic Smart/Quick Order in scope — CF-01/02)  
- Multi-currency / cross-border; multi-device sync/backend  

Formerly-deferred canvas features (Smart Order, B2C sales, procurement, commission monitor, premium, OTC, impersonation, offline toggle) are now **in scope, adapted** — see [12-ASSUMPTIONS-CONTRADICTIONS.md](./12-ASSUMPTIONS-CONTRADICTIONS.md) C3–C9 supersede notes + G23.

---

## 8. Roles Delivered

| Portal | Primary actors | Home job |
|---|---|---|
| Pharmacy | Owner, Manager, Staff, Accountant, (optional Delivery Boy for receipt) | Purchasing queues, payables, inventory |
| Stockist | Owner, Manager, Staff, Accountant, Delivery Boy | Fulfilment queues, receivables, catalogue |
| Platform Admin | Support Agent, Admin, Super Admin | Verification, governance, tickets, announcements |

Operational roles from `docs/12`. Primary business types from `docs/2`.

---

## 9. End-to-End Golden Path (Must Work Offline/Local)

1. Register Pharmacy + Stockist → Admin verifies both  
2. Pharmacy requests connection → Stockist approves  
3. Stockist loads catalogue + batches  
4. Pharmacy carts → places order  
5. Stockist accepts → allocates → packs → invoices → dispatches → delivers  
6. Pharmacy GRN / shortage path  
7. Pharmacy pays with proof → Stockist approves → outstanding updates  
8. Pharmacy returns damaged → Stockist approves → credit note → apply credit  
9. Both dashboards reconcile to source documents  
10. Admin can suspend, view audit, handle support ticket  

---

## 10. Quality Bar for “Complete”

A build is complete only when:

- Forbidden state transitions are impossible (`docs/10`, AC-N*)  
- Outstanding/inventory cannot go negative (`docs/11`, AC-O*, AC-F07)  
- Cross-business isolation holds (`docs/12`, AC-L05)  
- Expired batches cannot be delivered (`docs/16` E-Q01, AC-F06)  
- Every Part 8 journey has a working path or explicit blocked error  
- Part 18 AC suite passes (expanded as listed in `10-ACCEPTANCE-CHECKLIST.md`)  

---

## 11. Suggested Repo Layout (for later implementation)

```
apps/web/                 # Vite React SPA
  src/
    app/                  # shell, router, providers
    portals/
      auth/
      pharmacy/
      stockist/
      admin/
    domain/               # pure TS: machines, calc, permissions
    services/             # application services
    data/                 # dexie schema, seed, repositories
    ui/                   # design system components
    content/              # copy, FAQ, notification templates
```

---

## 12. Confirmation

- This folder contains **plan artifacts only**.  
- **No documentation files under `docs/` were edited or deleted.**  
- Implementation of the app is **not** part of this deliverable.
