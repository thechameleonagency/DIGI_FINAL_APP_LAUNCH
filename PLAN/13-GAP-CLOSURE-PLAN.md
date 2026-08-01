# 13 — Gap-Closure & Completion Plan (Plan of Record)

**Audit basis:** 2026-07-31 exhaustive audit — all 20 PDD docs (`docs/App Overview`, `docs/2`–`docs/21`), all 4 design canvases (`html/*.dc.html`), all PLAN files, and the full app source (`app/src`) cross-checked item by item.
**Status legend:** `Pending` · `In progress` · `Done` (update the Status column as items close; BUILD-STATUS.md stays a summary — this file is the ledger).
**Rule:** no code is changed during Step 0 (documentation). Development starts at Phase 1.

## 1. Scope statement

- Target scope = **PDD Parts 1–20** (`docs/App Overview`, `docs/2`–`docs/21`) **+ Part 21 addendum (`docs/22`)** which specifies every canvas-derived feature (CF-01…CF-39; CF-38 unassigned), **+ the canvas coverage guarantee in [14-CANVAS-COVERAGE-MATRIX.md](./14-CANVAS-COVERAGE-MATRIX.md)**.
- **Nothing that exists in the HTML canvases is skipped, removed, or deferred.** Canvas features that conflict with PDD rules are ADAPTED (docs/22 + PLAN/12 updates), never dropped. Only genuine external integrations (real SMS/email/payment gateways, real OCR/AI, maps APIs, multi-device sync/backend) are replaced by defined local/simulated equivalents.
- **User seed requirement (binding):** delete all existing dummy data; seed exactly **3 users** — 1 Platform Admin, 1 Stockist Owner, 1 Pharmacy Owner — with **zero business data** (true zero states everywhere); keep the login-page quick-login panel showing those 3 credentials.
- **UI rule:** the existing React design system (primitives, AppShell, ListToolkit, CSS tokens) is used as-is for everything new. No visual redesign.
- **Persistence rule:** everything stays local (Dexie/IndexedDB + session storage); workspace export/import must always cover all tables, including the new ones.

## 2. Step 0 — Documentation updates (Status: **Done 2026-07-31**, no code changes made)

| Item | File | Status |
|---|---|---|
| S0-1 | `docs/22` — Part 21 Canvas-Derived Feature Specifications (CF-01…CF-39) | Done |
| S0-2 | `PLAN/13` (this file) — full ledger + sequencing | Done |
| S0-3 | `PLAN/14` — canvas coverage matrix (every canvas view/modal/action → plan ref) | Done |
| S0-4 | `PLAN/01` — add Section Q (CF features), rework §O classification (nothing deferred) | Done |
| S0-5 | `PLAN/02` — nav/IA additions for CF screens | Done |
| S0-6 | `PLAN/03` — screen specs + journeys for CF flows | Done |
| S0-7 | `PLAN/04` — zero-state seed spec, boot-derived counters, new tables | Done |
| S0-8 | `PLAN/05` — new machines/calcs/permissions/edge cases for CF | Done |
| S0-9 | `PLAN/07` — route/component additions | Done |
| S0-10 | `PLAN/08` — new notification codes (N-301…), empty-state copy bank extension | Done |
| S0-11 | `PLAN/09` — post-audit addendum pointing here | Done |
| S0-12 | `PLAN/10` — evidence-honesty note + new AC-Q section for CF rules | Done |
| S0-13 | `PLAN/11` — matrix rows for docs/22, PLAN/13, PLAN/14 | Done |
| S0-14 | `PLAN/12` — supersede C3–C9 deferrals (now adapted-in-scope), add G21–G23 | Done |
| S0-15 | `PLAN/00` — index + status line updates | Done |
| S0-16 | `PLAN/BUILD-STATUS.md` — honest rewrite | Done |

## 3. Verified bugs (fix in Phase 1 — all reproduced in source)

| ID | Bug | Where |
|---|---|---|
| BUG-1 | `recordGrn` **double-counts pharmacy stock** on repeat calls; no 0…deliveredQty validation; `discrepancyReason` accepted but never stored; writes no `GRNIn` movement; no permission check | `services/fulfilmentService.ts` |
| BUG-2 | Messages **send to the wrong counterpart** — always the first Active connection, not the selected thread (both portals) | `PharmacyPages.tsx` ~L1054, `StockistPages.tsx` messages |
| BUG-3 | Multi-invoice payment takes `stockistId` from the first allocation — **cross-stockist allocations silently mis-target** | `PharmacyPages.tsx` ~L773 |
| BUG-4 | **Document numbers repeat after reload** — ORD/INV/PAY/DEL/RET/CN/TKT counters are in-memory only | `domain/utils/ids.ts` |
| BUG-5 | PharmacyCart renders a dead duplicate stockist `Select` with raw IDs (~L301–313); PharmacyBuy one `q` state filters stockist list AND product grid simultaneously (~L121–136) | `PharmacyPages.tsx` |
| BUG-6 | Suspended page "Contact support" hardcodes `/pharmacy/support` → guard bounces it → dead loop | `AuthPages.tsx` ~L316 |
| BUG-7 | Admin verification queue shares ONE `note` state across all cards; AdminSettings writes silently on blur with no `settings.manage` check and `return null` while loading (blank flash) | `AdminPages.tsx` |
| BUG-8 | **Seed wipe-loop trap:** `ensureSeeded()` requires `orders.count() >= 3` — with the zero-state seed it would wipe user data on every reload | `data/seed.ts` L84 |

## 4. Shared foundations (build once in Phases 1–2; consumed everywhere)

All services follow the existing pattern (`assertCan` → machine transition → write → audit → notify; see `fulfilmentService.issueInvoice` as template). UI uses existing primitives only.

| ID | Foundation | Files | Consumers |
|---|---|---|---|
| F1 | `ConfirmDialog` primitive wrapping `Modal` — confirm + required-reason variants; replaces every hardcoded decision reason ('Proof mismatch', 'Outside policy', 'Customer closed', creditDays 30, …) | NEW `ui/components/ConfirmDialog.tsx` | all destructive/decision actions |
| F2 | `fileService` (`storeFile`/`getFile` — dataUrl in `db.files`, 5 MB, PDF/JPG/PNG) + `FileUpload`/`FileLink` components | NEW `services/fileService.ts`, `ui/components/FileUpload.tsx` | verification docs, payment proof, POD, return evidence, premium UTR screenshot, counterfeit evidence, purchase bills |
| F3 | Persistent doc-number counters — `hydrateCounters()` scans max existing numbers per series from Dexie at boot and feeds existing `resetCounters(seed)`; `nextNumber()` stays synchronous (7 call sites untouched); re-hydrate after `importWorkspace` + stamp seedMeta on import | NEW `data/counters.ts`; `data/seed.ts`, `services/supportService.ts` | every document emitter |
| F4 | `notificationService` — `markRead`/`markAllRead` + `resolveNotificationLink()` routing by **entityType** (never N-code — app codes diverge from docs/13), permission-lost → "access denied, notification retained" (E-K01) | NEW `services/notificationService.ts` | all portals |
| F5 | Shared `NotificationsPage` (unread styling, click→deep-link, mark-all, filters) replacing the 3 per-portal pages — stockist/admin badges become clearable | NEW `ui/components/NotificationsPage.tsx` | all portals |
| F6 | `useCan()` hook + `NavItem.requires` filtering in AppShell + `RequirePermission` route guard (e.g., DeliveryBoy financial lockout, Accountant fulfilment lockout) | `store/session.ts`, `AppShell.tsx`, `app/guards.tsx` | every role-gated button/nav/page |
| F7 | `inventoryService` — stockist `stockIn` (qty>0, duplicate-batch check), `adjustStock` (± with mandatory reason, no-negative), `setBatchStatus` (Quarantine/Release/Recall via `machines.batch`); pharmacy `stockAdd`/`stockAdjust`; ALL write `inventoryMovements` + audit | NEW `services/inventoryService.ts` | stock-in rewire, GRN movement, adjustments, expiry/write-off, recall, PO receive (CF-17), POS decrement (CF-05) |
| F8 | `staffService` — `changeRole` (N-008), `suspendStaff`/`reactivateStaff`, `removeStaff` (N-009, attribution preserved), `revokeInvite`, `transferOwnership` (N-049, sole-owner guard), permission overrides + shared `StaffManager` page with copyable invite links | NEW `services/staffService.ts`, `ui/components/StaffManager.tsx` | pharmacy + stockist staff pages, admin platform-staff |
| F9 | ListToolkit opt-in `initialQuery`/`initialFilters` (state initializers only — zero change to existing pages) | `ui/components/ListToolkit.tsx` | every dashboard-card deep link |
| F10 | `changePassword`/`updateProfile` + shared `ProfileSecurityPage` at `/{portal}/profile` | `services/authService.ts`, NEW page | A5/A12 for all roles |
| F11 | Policy-clock emitters — N-028 overdue, low-stock, near-expiry/expired, invite expiry, announcement `endsAt` expiry, SLA reminders (verification/order/payment) — each **deduped by (code, entityId)** (clock fires every 5 min) | `services/supportService.ts` | dashboards, notifications |
| F12 | `useBusy()` — busy/disabled state for every mutating button (double-click protection) | `store/ui.ts` | app-wide |
| F13 | `GlobalSearch` in AppShell topbar — doc numbers, products, partners, pages; scope-gated (CF-29) | NEW component + `AppShell.tsx` | all portals |
| F14 | Mobile nav drawer — consume dead `sidebarOpen`, un-hide hamburger; every page reachable at mobile widths | `AppShell.tsx` | all portals |
| F15 | `InvoiceDocument` — lines, `gstSplit()`, discount/round-off, due/overdue, settlement ledger, print, **QR payload (CF-15)** | NEW `ui/components/InvoiceDocument.tsx` | pharmacy, stockist, admin views |
| F16 | connectionService additions — `blockConnection`/`unblockConnection` (N-015), disconnect with reason + assertCan, approve with credit terms (`creditDays`, `creditLimit`) | `services/connectionService.ts` | both portals + admin governance |
| F17 | `recordGrn` hardening — assertCan, 0…deliveredQty validation, ≥1 unit, one-GRN-per-delivery guard (`order.grnRecordedAt`), persist `discrepancyReason`, `GRNIn` movement via F7, audit | `services/fulfilmentService.ts` | BUG-1, GRN modal |

## 5. Phase overview

| Phase | Goal | Items |
|---|---|---|
| 1 | Seed reset (zero-state v3) + data-corrupting bug fixes + empty-state sweep + e2e rewrite | P1-* |
| 2 | Shared foundations F1–F17 + portal file split + permission gating | P2-* |
| 3 | Stockist fulfilment & delivery completion | ST-10…24 |
| 4 | Stockist money, returns, partners | ST-5…8, 25…34 |
| 5 | Stockist catalogue, inventory views, dashboards | ST-35…47 |
| 6 | Pharmacy purchasing loop | PH-7, 17…23, 37 |
| 7 | Pharmacy money, inventory, home/analytics | PH-9…16, 24…25, 39…40 |
| 8 | Auth, verification, business profile, staff UI | AD-7…16 + PH-26…29, 34 + ST-11, 52 |
| 9 | Admin portal completion | AD-10, 19…31 |
| 10 | Cross-portal polish + test expansion | PH-31, ST-51, 54, AD-17…18 + sweeps |
| 11 | Canvas modules — Pharmacy (CF-01…CF-10) | CF-* |
| 12 | Canvas modules — Stockist (CF-11…CF-21, CF-33, CF-35, CF-36, CF-39) | CF-* |
| 13 | Canvas modules — Admin (CF-22…CF-26) | CF-* |
| 14 | Canvas modules — Shared shell (CF-27…CF-32, CF-34, CF-37) + final full-app sweep | CF-* |

After every phase: `npm run build` + `npm test` + `npm run test:e2e` green.

---

## 6. THE LEDGER

### Phase 1 — Seed reset + critical bugs (one change-set)

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| P1-1 | Rewrite `seedAll()`: 3 businesses (Platform/Stockist/Pharmacy — Active + **Approved**), 3 owner users (emails/passwords matching the quick-login buttons verbatim), 2 Approved verification rows, 1 **empty** stockist catalogue, full `platformSettings` row, `seedMeta`; delete `PRODUCT_DEFS` + every demo-entity block + all `setCounter` calls; `SEED_VERSION = 3` (bump auto-wipes existing local DBs once) | Fresh profile boots to zero-state app; only 3 accounts exist; all trade tables empty | Done |
| P1-2 | Fix `ensureSeeded()` skip condition → `meta?.seedVersion === SEED_VERSION && users.count() >= 3` (drop `orderCount >= 3` — BUG-8) | Reload after creating data does NOT reseed | Done |
| P1-3 | LoginPage: blank prefilled credentials; keep 3 quick-login buttons with credentials shown in labels (`Pharmacy — neha@careplus.pune.in · Pharmacy@2026`); delete dead `DemoSelect` | Quick-login works for all 3 roles; fields default empty | Done |
| P1-4 | Persistent counters (F3) + `importWorkspace` seedMeta stamp + post-import re-hydrate | Two orders across a reload get sequential unique numbers; import of old export doesn't wipe | Done |
| P1-5 | Empty-state sweep: add `EmptyState` with guiding CTAs to all bare lists — pharmacy Returns / Inventory / Support / Notifications / Connections / Buy-empty-catalogue pane / Payments-History; stockist Pharmacies tabs / Inventory / Payments / Invoices / Credit notes / Staff / Support / Notifications; admin Support / Announcements+Banners / Audit / Notifications | Every list at zero data shows a guiding CTA, not bare headers | Done |
| P1-6 | Rewrite e2e for zero state (no fixtures): `zero-state.spec.ts` (blank login + 3 quick-logins land in right portals; empty states render), `registration-verification.spec.ts` (register→pending→admin approve→portal; dup GST/email blocked; forgot-password OTP), `golden-journey.spec.ts` (serial single context: connect→products+stock→order→accept/allocate/pack/invoice/dispatch/deliver→GRN→pay→approve→return→CN→apply; counter uniqueness across reload), `workspace.spec.ts` (export/import round-trip) | `npm run test:e2e` green from zero seed | Done |
| P1-7 | Rewrite `app/DEMO-SCRIPT.md` — 3 accounts, from-zero narrative, demo-reset box | Script matches seed v3 reality | Done |
| P1-8 | BUG-2 fix — messages route to selected thread's counterpart (both portals) | Message lands in the selected thread only | Done |
| P1-9 | BUG-3 fix — payment allocation grouped per stockist; per-invoice Pay prefill | Cross-stockist allocation impossible | Done |
| P1-10 | BUG-5 fix — remove dead cart Select; separate `stockistQ`/`productQ` on Buy | Cart/Buy behave independently | Done |
| P1-11 | F17/BUG-1 — recordGrn hardening + GRN modal caller update | Repeat GRN blocked; stock counted once; reason stored; movement written | Done |
| P1-12 | BUG-6 fix — suspended page portal-aware support route (full fix in AD-11) | No dead loop | Done |

### Phase 2 — Foundations + file split

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| P2-1 | F1 ConfirmDialog (confirm + required-reason; Esc closes) | Demoable; used on stockist order reject | Done |
| P2-2…P2-17 | Build F2–F17 as specified in §4 (F3 landed in P1-4; F17 in P1-11) | Each foundation demoable in isolation | Done |
| P2-18 | Split each portal's `*Pages.tsx` into `portals/<portal>/pages/*.tsx` module files with barrel re-exports (mechanical commit, no logic); add new route entries per PLAN/07 | Build green; all existing routes unchanged | Done |
| P2-19 | Wire `useCan` gating: nav trimming + `RequirePermission` on financial routes; add missing `assertCan` to cart/wishlist/GRN/messages/tickets/connection-cancel/disconnect/stock-in services | Accountant sees no fulfilment buttons; DeliveryBoy sees no financial pages; Staff sees no payment submission | Done |
| P2-20 | Dexie `version(2)` single schema bump adding ALL new tables (see PLAN/04): `smartOrderRuns, customerSales, deliveryAreas, pharmacyRoutes, partnershipApplications, partnerInvites, suppliers, purchaseOrders, purchaseBills, supplierReturns, stockistRoutes, upgradeRequests, counterfeitReports, priceChanges, favourites` (+field additions on existing tables) | Upgrade from v1 DB preserves data; export/import covers new tables | Done |

### Phase 3 — Stockist fulfilment & delivery (gap items ST-10…ST-24)

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| ST-10 | Audit writes for allocate/pack/dispatch/delivery-status/return decisions/CN issue+apply/order cancel/stock movements | Every mutation has an audit row | Done |
| ST-12 | Order detail completeness: pharmacy name, delivery address, notes, per-line unit price/GST/line total, order subtotal/tax/grand total, invoice link | All order facts visible | Done |
| ST-13 | Partial acceptance — per-line acceptedQty inputs feeding existing `acceptOrder({acceptedQtys})`; PartiallyAccepted badge | Partial accept reachable from UI | Done |
| ST-14 | Manual batch-allocation override picker (sellable batches per line, qty inputs) feeding `allocateOrder({overrides})`; FEFO-override audit | Manager can override FEFO with audit | Done |
| ST-15 | Stockist Cancel order button (Pending/Accepted/PartiallyAccepted/Allocated) with reason + confirm (existing `cancelOrder`) | Stockist cancel works, reservations released | Done |
| ST-16 | Apply F1 decision modals to: order reject, payment reject/hold, return reject, connection reject, delivery fail | No hardcoded reasons remain | Done |
| ST-17 | Orders inbox: Pending-first default sort; pharmacy/payment-status/total columns; pharmacy + date-range + amount filters; add missing status filter options (PartiallyAccepted/PartiallyDelivered/Closed/Draft) | docs/14 list completeness | Done |
| ST-18 | Close order (Delivered→Closed) service + UI + list handling | G10 journey works | Done |
| ST-19 | Delivery cards: pharmacy name, address, contact; link to order | Delivery boy sees the spec-required minimal fields | Done |
| ST-20 | Partial delivery — per-line delivered-qty modal → `updateDeliveryStatus('PartiallyDelivered', {deliveredQtys})`; completion trip (PartiallyDelivered→Delivered) | H7/H20 reachable | Done |
| ST-21 | POD capture via F2 (`podFileId`), received-by name; POD link on card | Delivered w/ proof visible | Done |
| ST-22 | Fail-reason modal; Returned-to-Stockist action after Failed with restock movement | H8 tail complete | Done |
| ST-23 | Assign/reassign/unassign delivery from card (re-emit N-023) | H17 works | Done |
| ST-24 | Delivery ListToolkit (search/status/assignee/date/history) + routes management (extended by CF-18) | docs/14 delivery dataset done | Done |
| ST-56 | Edit pending-order lines (stockist and pharmacy sides where allowed): editable while Pending/Accepted, locked after Pack ("adjust via returns" after delivery) — PDD G7 + canvas Edit-Items gates | Line edits impossible after pack; edits audited + re-priced by snapshot rules | Done |

### Phase 4 — Stockist money, returns, partners (ST-5…8, 25…34)

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| ST-5 | Block/Unblock connection (F16) + buttons on Active/Blocked tabs; N-015 | Blocked tab functional | Done |
| ST-6 | Stockist-side disconnect UI (reason via F1) | E9 stockist side works | Done |
| ST-7 | `voidInvoice` (perm `invoice.void`, Issued-only, zero paid/credit, reason, N-029, audit) + UI | I6 works | Done |
| ST-8 | Goods-received-back: `recordGoodsReceived(returnId, disposition)` → GoodsReceived status + `ReturnIn` movement (Restock/Quarantine/Destroy inventory effects) | Approved returns have physical inventory effect | Done |
| ST-25 | Payment Hold (+reason) and Resume via existing `reviewPayment`; reject-reason modal | J7/J16/J17 reachable | Done |
| ST-26 | Payment review modal: pharmacy, date, method, allocations (invoiceNo + amount), proof preview (F2) | Informed approve/reject | Done |
| ST-27 | Payments + invoices ListToolkit: search/status/date filters/export (I12) | docs/14 datasets done | Done |
| ST-28 | Invoice detail page (F15) + link from order detail/payments | Full invoice visibility incl. GST split, settlement ledger, print | Done |
| ST-29 | Credit-limit exposure: show `pairOutstanding` + creditLimit on connection/pharmacy views; soft-warn override modal at accept/invoice when exceeded | docs/11 §2.28 visible | Done |
| ST-30 | Return review: per-line approvedQty (partial approval), disposition select, reject-reason modal, return detail (order/invoice links, values) | K7 complete | Done |
| ST-31 | "Record goods received" button on Approved returns wiring ST-8 | Physical track closed | Done |
| ST-32 | CN apply modal: invoice chooser + amount input; CN detail with application history; empty state | K9/K11 informed | Done |
| ST-33 | Connection approve modal: credit days + credit limit inputs; reject-reason modal; request review detail (pharmacy GST/DL/address) | E14 configurable terms | Done |
| ST-34 | Pharmacy (customer) detail page: orders, invoices, outstanding, last trade, message shortcut | Relationship view exists | Done |

### Phase 5 — Stockist catalogue, inventory, dashboards (ST-35…47)

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| ST-35 | Edit product flow (prefilled form → `upsertProduct(productId)`); clear form after save; add gstPercent/maxQty/hsn inputs | F15 product edit works | Done |
| ST-36 | Product status actions Deactivate/Reactivate/Discontinue (+ verify pharmacy browse filters `status==='Active'`) | F16 works, no leak to browse | Done |
| ST-37 | CSV file upload (`<input type=file>`) + downloadable template; per-row skipped-line feedback | Import UX complete | Done |
| ST-38 | Bulk price update (scope→adjust→preview→apply) + price-change log + N-046/N-047 emitters (extended by CF-20 history view) | F19 works | Done |
| ST-39 | Catalogue status toggle (Active/Maintenance/Inactive); Maintenance hides from pharmacy browse w/ blocked-state message (E-T15) | Machine honored | Done |
| ST-40 | Inventory ListToolkit: search, filters (low stock/expired/near-expiry/zero/quarantined/recalled), sort, export | docs/14 inventory dataset | Done |
| ST-41 | Movement history screen (per product/batch: type/qty/prev/new/reason/source doc) | L10 works | Done |
| ST-42 | `reorderLevel` field on product + low-stock flag via `lowStock()` + low-stock view + dashboard card | L3 works | Done |
| ST-43 | Expiry management view: band tiles (Expired/≤30/≤90/Safe), filters, value-at-risk | L4 works | Done |
| ST-44 | Home cards: To Pack, To Dispatch, Out for Delivery, Overdue Receivables, Returns to Review, Low Stock, Near Expiry — each deep-linking to pre-filtered lists (F9) | docs/15 §4.4 cards | Done |
| ST-45 | Home graphs: receivables aging, top pharmacies, delivery success/fail; announcements banner renders on Stockist Home | docs/15 graphs + E-T17 partial | Done |
| ST-46 | Analytics: period selector + Sales/Collections/Inventory/Operations sections per docs/15 KPI dictionary + CSV export | O-series capabilities done | Done |
| ST-47 | Role-variant dashboards: Accountant subset; DeliveryBoy board (assigned/out/completed/failed only, NO financial KPIs) | docs/15 visibility matrix honored | Done |

### Phase 6 — Pharmacy purchasing loop (PH-7, 17…23, 37)

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| PH-7 | GRN modal upgrade: per-line batch+expiry inputs, discrepancy-reason select required on mismatch, ≥1-unit + range validation, post-save success card with "Raise return" prefill for short lines | H10/H11 complete | Done |
| PH-17 | Checkout step: delivery-address book (CRUD on Business) + address picker + preferred delivery date + review with Subtotal/GST/Total before placeOrder | F10/F11 inputs captured | Done |
| PH-18 | Reorder action on order detail/list — rebuild cart from lines (skip inactive w/ report) | F12/F13 works | Done |
| PH-19 | Orders list completeness: full status filter set, stockist column + filter, date-range, payment-status column | docs/14 orders dataset | Done |
| PH-20 | Order detail completeness: stockist name, delivery address, notes, expected-delivery panel, per-line tax, "Message about this order" shortcut | G8/M6 done | Done |
| PH-21 | Product detail page (`/pharmacy/product/:id`) + Compare Prices view (CF-03: cross-stockist compare, lowest-price highlight, connection-gated) | F4/F5 work | Done |
| PH-22 | Catalogue card upgrade: qty stepper, MRP + discount display, in-cart Update state, hide exact stock from non-connected (In/Out of stock only), sticky mini-cart bar | docs/8 §7 privacy + canvas parity | Done |
| PH-23 | Wishlist actions: remove, add-to-cart (connection-guarded), move-all, price/stockist info, nav entry, disconnected-disabled state | E-T02 handled | Done |
| PH-37 | Cart robustness: guard deleted product, flag inactive/disconnected lines, Clear Cart, price-change confirm diff at submit, maxQty recheck in placeOrder | E-D01/E-D02/F22/F23 closed | Done |

### Phase 7 — Pharmacy money, inventory, home (PH-9…16, 24…25, 39…40)

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| PH-9 | Payment proof upload (F2 → `proofFileId`), honor `paymentProofMandatory`, proof indicator in history; add Cash/Cheque/RTGS methods | J2/J14/J15 closed | Done |
| PH-10 | Invoices list (incl. Paid/Void) + invoice detail (F15) + export | I11/I12 pharmacy side | Done |
| PH-11 | CN apply chooser modal (open invoices of CN's stockist + amount); CN cards show source return, status, application history | J8/K9 informed | Done |
| PH-12 | Return modal upgrade: per-line reasons, evidence attach (F2), eligibility display (delivered − already returned), zero-line UI block | K1/K2 complete | Done |
| PH-13 | Returns page: columns (stockist/reasons/value/linked CN), detail, search/filter/export, "New Return" flow with delivered-order picker | K-series lists done | Done |
| PH-14 | Pharmacy inventory movements: GRN writes movement (F17), manual Add Medicine modal (product/batch/qty/MRP/expiry/reason), adjust/remove with reason, movements view | L1/L2/L10/L15/L16 | Done |
| PH-15 | Inventory list upgrade: search/filter, low-stock + expiry-band views, badges, KPI tiles, write-off, export | L3/L4 partial | Done |
| PH-16 | Expiry management screen: Expired/≤30/≤90/Safe tiles + Write off + Mark return | L4 done | Done |
| PH-24 | Home per docs/15: Awaiting Delivery, Overdue Payables, Open Returns, Available Credit, Low Stock, Near Expiry, Unread cards — all deep-linked; Payables Aging + Top Suppliers graphs; zero-connection CTA | Pharmacy Home spec complete | Done |
| PH-25 | Analytics expansion: period selector, supplier performance, payments aging, report CSV exports | O-series + docs/15 | Done |
| PH-39 | Per-stockist Ledger (CF-08): Purchases/Paid/Outstanding tiles + signed chronological entries via `pairOutstanding` | Ledger reconciles with invoices/payments | Done |
| PH-40 | Stockist detail page: profile + KPI tiles + Request connection + view catalogue + ledger link + holidays (CF-19 display) | E2 public profile done | Done |
| PH-41 | Connections page completeness: per-pair derived stats (orders, outstanding, last trade), rejection-reason display, re-request from page, search/filter/sort/export, disconnect confirm w/ reason | docs/8 §4 pair data visible; E13 reason shown | Done |

### Phase 8 — Auth, verification, profile, staff (AD-7…16, PH-26…29, 34, ST-11, 52)

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| AD-7 | Registration wizard validation: per-step required checks, GSTIN/phone/PIN (+PAN) regex, duplicate-phone + duplicate-DL service checks, `:type` param guard, step indicator, state select, stockist serviceable-PIN chips, consent checkboxes + legal modal, bank/UPI step | E-A02/E-A03/E-T11 closed; canvas wizard parity | Done |
| AD-8 | Document upload step in wizard (F2): 5 MB/type checks, `Verification.documentIds`; submitted-docs panel on `/auth/pending`; per-document license fields; simulated phone-OTP verify widget (demo OTP) | B1/B2 docs captured | Done |
| AD-9 | Pending workspace completion: show `requestDocsNote`/rejection reason, Rejected timeline node, "Re-upload & resubmit" wiring orphaned `submitVerification` | B8/B9 closed; no dead-end | Done |
| AD-11 | Suspended experience: portal-aware support contact, "Request reactivation" → N-057 to admins; suspended businesses get read-only portal entry (services already gate trade) — history visible per docs/12 §6 | Q1–Q3/Q7 honored; AC-M01 still passes | Done |
| AD-13 | Session hardening: TTL from `issuedAt` (re-login message), focus/interval re-validation of user+business (suspend/remove reflected live), optional failed-attempt lockout | A7/A10/D12/E-B04 | Done |
| AD-16 | Invite links: copyable `/auth/invite/:token` + expiry in StaffManager; invite-accept page shows role/business context + confirm password; revoke/resend | A6/D2 complete | Done |
| PH-26/ST-9 | Staff lifecycle UI both portals via F8 (role change, suspend/reactivate, remove, transfer ownership, overrides editor, Delivery role option for pharmacy) | D3–D8/D11 work | Done |
| PH-27 | Verification resubmission entry from pharmacy Business page too | B8 reachable in-portal | Done |
| PH-28/ST-52 | Business profile editing: profile form (lock GST/DL/type post-verification), bank details, preferences, service-PIN editor (stockist), documents list/upload, workspace-brand rename (CF-25-adjacent display name) | C1/C2/C4/C5 done | Done |
| PH-29 (=F10) | Profile & security page all portals: change password, name/phone edit | A5/A12 done | Done |
| PH-34 | (merged into AD-11) | — | Done |
| PH-35 (=F14) | Mobile nav drawer | All pages reachable on mobile | Done |
| ST-11 | Stockist-side verification resubmission entry | B8 stockist side | Done |

### Phase 9 — Admin completion (AD-10, 19…31)

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| AD-10 | Verification review upgrade: per-card note state (BUG-7), required reasons, document viewer (F2), `/admin/verifications/:id` detail, queue search/filters/Days-Pending/export, internal notes separate from business-visible reason | P1/P2 complete | Done |
| AD-19 | Admin Home: clickable KPI drill-downs, Documents-requested + Waiting-on-requester cards, GMV = Σ non-void issued invoices, inline pending-verifications list | docs/15 §12 cards | Done |
| AD-20 | Business detail page (`/admin/network/:id`): profile, verification history, documents, users, derived totals, Suspend/Reactivate/Deactivate in place | P5 complete | Done |
| AD-21 | Deactivate business service + UI (login blocked, history retained) | Q6 works | Done |
| AD-22 | Admin detail views: `/admin/orders/:orderNo`, `/admin/payments/:paymentNo`, counterparty names in lists, date filters; NEW Returns oversight list (P6) | Read-only oversight complete | Done |
| AD-23 | Support console: reply body → updates thread, Assign (+N), WaitingOnRequester/Close/Reopen, priority badges, search/filters, ticket detail route, empty state | N3–N6 complete | Done |
| AD-24 | Announcement service: targetRoles/placements/priority/endsAt form, edit/unpublish, `announcement.manage`, audit, N-045 fan-out; render on ALL dashboards honoring targetRoles; policy-clock expiry (E-T17/E-T18) | Announcements correct everywhere | Done |
| AD-25 | Banner management CRUD (modal per canvas) + render by placement (Auth + portal dashboards) + expiry | P8/P13 done | Done |
| AD-26 | Suspensions polish: per-row reason, confirm modal with impact copy, audit note, suspended-first view, reactivation-request inbox | P3/P4 + Q7 complete | Done |
| AD-27 | Audit log toolkit: search/date/entity filters, pagination past 200, before/after expansion, CSV export gated `audit.export`, empty state | P10/P15 done | Done |
| AD-28 | Settings completion: all PlatformSettings fields (verificationSlaHours, paymentSlaHours, billAheadAllowed, roundingMode, expiryNearDays/CriticalDays, creditNoteAutoExpire/Days), explicit Save + toast + audit + `settings.manage`, loading skeleton, auto-reload after import | P9 done; BUG-7 settings closed | Done |
| AD-29 | SLA reminder engine in policy clock (verification/order/payment ages vs settings) | B10/N-048-class emitted | Done |
| AD-30 | Suspicious-activity view: duplicate-GST candidates + duplicate payment-reference flags (folded into CF-22 Transactions view) | P11/P16/P17 surfaced | Done |
| AD-31 | Admin sub-role UI gating (SupportAgent/Admin/SuperAdmin) + platform staff management (invite SupportAgent/Admin) + enforce `announcement.manage`/`settings.manage`/`audit.export` | docs/12 §6 honored | Done |

### Phase 10 — Cross-portal polish + tests

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| PH-31/ST-51 | Shared TicketPanel: category+priority selects, detail with updates thread, add update, reopen, related-entity reference | N1/N2/N6/N10 both portals | Done |
| PH-30 (=F4/F5) | Notification UX everywhere (deep links, per-item read, filters, preferences per CF-30) | M2/M3/M8 done | Done |
| PH-33 (=F11) | Policy-clock emitters live | N-028/039/040/041 firing deduped | Done |
| PH-36 (=F3) | (Phase 1) | — | Done |
| PH-38/ST-53 | Final busy/disabled + empty/loading state sweep; export toasts honest | No double-click hazards; no unconditional success toasts | Done |
| ST-48 (=F6) | (Phase 2) | — | Done |
| ST-49/ST-50 | Messages completion: new-thread pickers (Active connections), `readBy` marking, unread badges, chat search, order-context linking | M6 done | Done |
| ST-54/AD-18 (=F13/CF-29) | Global search all portals | Doc numbers + names findable | Done |
| ST-55 | SLA reminders stockist-side surfacing | Reminders visible | Done |
| AD-17 (=CF-28) | Onboarding walkthrough (4 role-specific slides, seen-flag, replay) | First-login walkthrough works | Done |
| AD-33 | Notification code mapping note (app codes ↔ docs/13 semantics) in PLAN/08; deep links route by entityType | No code/doc mismatch confusion | Done |
| T-1 | Vitest additions: staff/inventory/file/notification services, policy-clock emitters, counters, permission matrix cells | New services covered | Done |
| T-2 | e2e additions: GRN idempotency, partial accept/delivery, payment hold, return disposition→stock, announcement targeting, role-gated nav | Long-tail AC automated | Done |

### Phase 11 — Canvas modules: Pharmacy (docs/22 §CF-01…CF-10)

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| CF-01 | Smart Order (assisted reorder): rule-based suggestion wizard (low stock + purchase history + near-expiry replacements) → editable suggestion lines → adds to cart ONLY (never auto-places); `smartOrderRuns` history screen | AC-Q01: suggestions never place an order; run history persisted | Done |
| CF-02 | Quick Order: paste text lines → parser matches connected stockists' products → matched/unmatched review table → cart | AC-Q02: unmatched lines never silently dropped | Done |
| CF-03 | (delivered with PH-21 Compare Prices) | — | Done |
| CF-04 | Marketplace discovery: cross-stockist product browse/search; price + add-to-cart gated on Active connection; "Connect to see price" CTA rows; seller-detail → stockist detail page | Connection gate enforced (docs/20 #16 honored) | Done |
| CF-05 | Customer Sales / POS: New Sale modal (customer, lines from pharmacyInventory, FEFO decrement, payment mode), sales list + detail, return/void with reason + restock | AC-Q06: sale cannot drive stock negative; void restores | Done |
| CF-06 | Customer delivery areas & routes: `deliveryAreas` + `pharmacyRoutes` CRUD, assign home-delivery sales, mark delivered | Local B2C delivery loop closes | Done |
| CF-07 | OTC Partnership wizard → `partnershipApplications` (Submitted) → admin review queue → approve/reject + status badge | Application lifecycle complete | Done |
| CF-08 | (delivered with PH-39 Ledger) | — | Done |
| CF-09 | Delivery preferences (slots/instructions/default receiver) on business preferences; shown to stockist on order/delivery | Preferences visible to counterpart | Done |
| CF-10 | Favourite/pin stockists + private supplier rating; favourite-first sort in directory | Favourites persist; ratings private | Done |

### Phase 12 — Canvas modules: Stockist (docs/22 §CF-11…CF-21)

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| CF-11 | Manual Order on behalf of connected pharmacy (source='Manual', createdBy=stockist): product picker + qty (+ CF-02 parser); pharmacy notified + order visible/cancellable in pharmacy portal; then normal fulfilment | AC-Q03: manual order visible to pharmacy immediately | Done |
| CF-12 | Partner invite ("Add Pharmacy" adapted): shareable registration invite link/text, `partnerInvites` tracking (Sent/Registered/Connected); existing GST/phone → connection deep-link | No pharmacy records created by stockists | Done |
| CF-13 | Offline payment recording: stockist logs remittance (amount/mode/reference/proof) → Payment `recordedBy='Stockist'` in Submitted → pharmacy notified → stockist approves (dual-entry + audit preserved); "Mark Paid" = prefilled shortcut | AC-Q04: recordedBy permanently visible; duplicate-ref guard applies | Done |
| CF-14 | Send reminder: per overdue invoice/pharmacy → in-app notification + message template; throttled 1/day/invoice; logged | Reminders visible to pharmacy, throttled | Done |
| CF-15 | QR on bill + `/verify-bill` public route: QR payload (invoiceNo, stockist, total, date, integrity hash) on InvoiceDocument; verification page → Genuine/Mismatch/Not found | AC-Q05: tampered amount detected as mismatch | Done |
| CF-16 | Bulk bill generation: multi-select ready orders → batch invoice issue (one per order) with per-order success/failure report | Partial-success semantics honored | Done |
| CF-17 | Supplier procurement module: `suppliers` CRUD; `purchaseOrders` (Draft→Sent→PartiallyReceived→Received→Closed/Cancelled) with lines; receive → stock-in batches via F7 (movement source='PO'); `purchaseBills` history (+file attach); Required-Stock → draft PO; `supplierReturns` for expiring stock (Sent/Settled + stock decrement); bill quick-entry with text parser (OCR simulated) | AC-Q07: PO receive increments stock via movement; supplier return decrements | Done |
| CF-18 | Delivery routes & scheduling: `stockistRoutes` (name/area/assignee/stop order), assign deliveries, route execution view (ordered stops, per-stop Delivered/Failed, maps deep-links), scheduled delivery date at dispatch, optional delivery-fee rule shown at invoice issue | Routes drive multi-stop delivery | Done |
| CF-19 | Holidays list on business; shown on stockist profile/detail; order placement shows info banner (never blocks) | Holiday visibility works | Done |
| CF-20 | Price history view from `priceChanges` log (with ST-38 bulk update) | Price audit trail visible | Done |
| CF-21 | Public catalogue share: read-only snapshot route (products/pack/MRP — NO PTR) + copy link/QR | Pricing privacy preserved | Done |
| CF-33 | Stock transfer between own locations: location labels + paired TransferOut/TransferIn movements (qty ≤ un-reserved on-hand) | AC-Q10: totals unchanged, movements paired | Done |
| CF-35 | Consolidated batch-ordering view: open orders grouped by cycle/route/date w/ totals + shortcuts into fulfilment/bulk-invoice/route actions | Planning view reflects live orders only | Done |
| CF-36 | Product reference autofill: bundled medicine reference list; "Auto-fill" on product form + "Enhance all" sweep (fills empty fields only, reports per row) | Never overwrites user-entered values | Done |
| CF-39 | Goodwill credit note (manual, reason required, source=Goodwill) + Advance credit note on recorded-payment surplus (confirm required, source=Advance, linked to payment) | AC-Q11: both sources visible to pharmacy; advance ≤ surplus | Done |

### Phase 13 — Canvas modules: Admin (docs/22 §CF-22…CF-26)

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| CF-22 | Commission monitor & Transactions: commission config (global % + per-business override) in settings; derived read-only ledger from non-void issued invoices (period/stockist filters, CSV); Transactions view of all payments/invoices with anomaly flags (folds AD-30) | AC-Q08: ledger totals reconcile to invoice sums; zero writes to financial docs | Done |
| CF-23 | Premium/plans: plan tiers page (admin-editable copy/price), business Upgrade page (benefits, UPI/UTR + screenshot via F2) → `upgradeRequests` → admin approve/reject → Premium badge + feature flags | Upgrade lifecycle complete | Done |
| CF-24 | Counterfeit management: `counterfeitReports` (file from pharmacy product/batch context or admin), queue Investigate → issue batch Recall (existing machine + holder notifications) → Resolve/Dismiss with note; audit | Report→recall→resolve chain works | Done |
| CF-25 | Impersonation ("Log in as"): SuperAdmin-only, reason required, READ-ONLY view-as with banner, all mutations blocked (session flag enforced in services), audit on enter/exit, Exit-to-admin | AC-Q09: zero mutations possible while impersonating | Done |
| CF-26 | Reports hubs: admin canned CSVs (registrations, verification throughput, GMV monthly, tickets, commission summary); pharmacy reports (purchases, GST summary, stock aging); stockist reports (sales, GST, outstanding, stock aging) | Every report downloads with filter summary + timestamp | Done |

### Phase 14 — Canvas modules: Shared shell + final sweep (docs/22 §CF-27…CF-32)

| ID | Item | Exit criterion | Status |
|---|---|---|---|
| CF-27 | Help Center per portal: FAQ accordion, per-journey quick guides, contact card, ticket link, walkthrough replay | Help hub reachable from nav + More | Done |
| CF-28 | (delivered with AD-17 onboarding) | — | Done |
| CF-29 | (delivered with F13 global search) | — | Done |
| CF-30 | Settings toggles: notification preferences (per-category mute → honored by notify fan-out), theme toggle (light default unchanged; dark = CSS-var overlay), language selector (en active, architecture ready), local-first indicator toggle, active-session info | Preferences persist and take effect | Done |
| CF-31 | Profile dropdown in topbar (name/role, Profile, Settings, Sign out w/ confirm) | Canvas shell parity | Done |
| CF-34 | Role preview (Owner-only): apply another role's UI gating to own session w/ banner + exit; presentation-only, actions still audited as Owner | Preview never changes real permissions | Done |
| CF-37 | Business activity log (own scope): filterable read-only audit view per business + export (audited); admin keeps platform-wide log | Strictly own-business scope | Done |
| CF-32 | Dashboard interaction parity: KPI detail modals or deep-links, "Today's Work" tiles, Quick Actions grids, post-action success summary cards (place order / GRN / payment) | Canvas dashboard interactions present | Done |
| SW-1 | Final full-app sweep: every journey in docs/9 (A–R) + docs/22 walked end-to-end for all roles + sub-roles; mobile widths; workspace export/import incl. all new tables; PLAN/10 checklist evidence updated; PLAN/14 matrix statuses updated | All ledger rows Done or explicitly re-scoped with user approval | Done |

---

## 7. Seed reset design (Phase 1 detail)

- **Identities (match quick-login buttons verbatim — zero UI churn):** `admin@digiswasthya.in`/`Admin@2026` (SuperAdmin, DigiSwasthya Ops), `vikram@medroute.in`/`Stockist@2026` (Owner, MedRoute Distributors), `neha@careplus.pune.in`/`Pharmacy@2026` (Owner, CarePlus Chemists).
- **`seedAll()` seeds ONLY:** 3 businesses (Active + Approved; identity fields kept — GST/DL/city/state for GST inference; bank/UPI/servicePins dropped → filled via UI later), 3 owner users, 2 Approved verification rows (`documentIds: []`, decisionHistory retained), 1 empty stockist catalogue (`upsertProduct` fails `CAT_MISSING` without it), full `platformSettings` row (AdminSettings/`inviteStaff`/policy clock depend on it), `seedMeta` v3. All other tables empty.
- **Why businesses must be Approved:** unverified owners are routed to `/auth/pending` and their portal is unreachable — the demo would be dead on arrival.
- **`SEED_VERSION = 3`** — version bump triggers the one-time `clearAllTables()` wipe of existing local DBs = "delete all existing dummy data" lands on every machine automatically.
- **Skip condition:** `meta?.seedVersion === SEED_VERSION && users.count() >= 3` (BUG-8 fix). Keep the retry-after-`db.delete()` fallback.
- **Counters (F3):** `hydrateCounters()` derives per-series floors by scanning existing document numbers at boot (self-healing, no schema change, `nextNumber` stays sync); called at end of `ensureSeeded()` and after `importWorkspace()`; import also stamps seedMeta v3 (else importing an old export triggers a wipe on next reload).
- **LoginPage:** blank prefills; keep 3 quick-login buttons with credentials visible in labels; delete dead `DemoSelect`.
- **Verified:** no code outside `seed.ts` references seed IDs/emails (grep-confirmed); only e2e + DEMO-SCRIPT break — both rewritten in Phase 1.

## 8. Test strategy

- **Vitest** suites are pure-domain — unaffected by seed; extended in Phase 10 (T-1).
- **Playwright**: all specs build their own data from zero state (fixtures rejected — they would mask exactly the zero-state bugs the audit found). Fresh context = fresh IndexedDB = fresh v3 seed; the trade journey runs as ONE serial spec sharing a context (role switches via sign-out/sign-in). Spec list in P1-6, extended in T-2.
- **Manual verify** after each phase: `npm run dev` → walk the phase's journeys at desktop + mobile widths.

## 9. Risks & ordering rules

1. P1-1 and P1-2 must land in the same commit (wipe-loop trap), together with P1-6 (old e2e dies the moment seed v3 lands).
2. Keep `nextNumber` synchronous; hydrate after `ensureSeeded`, before first render; re-hydrate + stamp seedMeta after import.
3. `recordGrn` signature change updates its sole caller in the same commit.
4. ListToolkit changes strictly additive; URL filter values must exactly match `FilterDef` option values.
5. Notification deep links route by entityType, never N-code (app catalog numbering ≠ docs/13 numbering — mapping table in PLAN/08).
6. Every policy-clock emitter needs (code, entityId) dedupe or 5-minute spam.
7. Permission gating uses only Action strings already proven in services; new CF actions (`sale.record`, `supplier.manage`, `po.manage`, `route.manage`, `plan.manage`, `counterfeit.review`, `impersonate`, `partner.invite`, `reminder.send`) get matrix rows in PLAN/05 before UI gating.
8. Do the portal file split (P2-18) before Phases 3–9, or code moves twice.
9. Suspended read-only mode keeps service-level gates as enforcement; verify AC-M01 after AD-11.
10. All new tables land in ONE Dexie `version(2)` bump (P2-20); workspace export/import iterates `db.tables` so it inherits them automatically — verify round-trip in `workspace.spec.ts`.
11. CF financial-adjacent modules (commissions, premium, POS, offline payment recording) are derived views or flagged records — invoices/payments/orders remain the single source of truth (PDD principle 3/6); every CF spec in docs/22 restates this.
12. Canvas features needing external services are built as local equivalents (CF-BRIEF rule): parser instead of OCR, rule engine instead of AI, QR + local lookup instead of server verification, maps deep-links instead of maps API.
