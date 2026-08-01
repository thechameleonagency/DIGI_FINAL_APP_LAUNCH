# Data Models & Local Persistence Strategy

Authority: `docs/3`, `docs/8` (entity specs), `docs/4` relationships, `docs/11` derived fields.

---

## 1. Persistence Choice

| Store | Use |
|---|---|
| **IndexedDB (Dexie)** | All business entities, movements, audit, notifications, messages, tickets, seed meta |
| **sessionStorage** | Ephemeral UI (cart draft optional sync), tab session token |
| **localStorage** | `ds.session` (current user id), theme prefs, onboardingSeen flags (compat with canvas keys optional) |
| **Memory EventBus** | Domain events within session; notifications persist to IDB |

**Seed versioning:** `meta.seedVersion` — bump + migration functions (pattern from canvas `SEED_VER`).

**Backup:** Settings → Export workspace JSON / Import JSON (demo disaster recovery; `docs/18` §16 product expectation).

**No sync** across browsers/devices in v1.

---

## 2. Dexie Tables (Logical Schema)

### `businesses`
Fields per `docs/8` Business required/optional + statuses.  
Indexes: `type`, `accountStatus`, `verificationStatus`, `gstNumber`, `drugLicenseNumber`, `city`.

### `users`
Required/optional per User entity.  
Indexes: `businessId`, `phone`, `email`, `status`, `role`.  
`passwordSalt`, `passwordHash` (Web Crypto).  
Rule: exactly one business; owner transfer fields.

### `verifications`
One current per business + history rows or embedded `decisionHistory[]`.  
Statuses: Not Started → … → Approved/Rejected (`docs/10` §2).  
Documents: `{ id, name, mime, blobKey, uploadedAt }[]` stored in `files` table.

### `connections`
Unique active pair constraint `(pharmacyId, stockistId)` where status=Active.  
Statuses: Requested, Active, Rejected, Disconnected, Blocked (+ Cancelled request terminal).

### `products` + `catalogues`
One catalogue per stockist (`catalogueId` or implicit). Product fields per `docs/8`.  
Price history append-only in `productPriceHistory` or embedded audit.

### `batches` + `inventoryBalances`
Batch-level stock. Balance: `onHand`, `reserved`, derived `available`.  
Locations optional string (single-pool).

### `inventoryMovements`
Append-only: type (StockIn, Reservation, Release, DispatchConsume, ReturnIn, Adjustment, Expiry, Quarantine, Transfer…), qty, reason, sourceDocType/Id, actorId, at, prev/new qty.

### `orders` + `orderLines`
Order header + lines with **price/tax snapshots**.  
Timeline/statusHistory[]. IdempotencyKey unique.

### `deliveries` + `deliveryLines`
Link orderId/invoiceId; assignment; POD file keys; partial qty.

### `invoices` + `invoiceLines`
Immutable lines after Issued. `outstanding` derived but cached with version. Number unique per stockist.

### `payments` + `paymentAllocations`
Allocations to invoices. Proof file key. Duplicate detection fields.

### `returns` + `returnLines`
Eligibility checks vs delivered qty − prior returned.

### `creditNotes` + `creditApplications`
Remaining amount; applications to invoices.

### `notifications`
Per `docs/8` Notification + template code N-xxx.

### `messageThreads` + `messages`
Participants; optional `relatedEntity`.

### `supportTickets` + `ticketUpdates`

### `announcements` + `banners`

### `auditLogs`
who, when, entityType, entityId, action, before, after, reason.

### `platformSettings`
SLA, windows, rounding mode, expiry bands, feature flags.

### `files`
id, name, mime, size, blob (Blob) or base64 for small demos.

### `wishlists` / `carts`
Pharmacy-scoped; cart not an official PDD entity but required for F6–F11 journeys — treat as **session/intent** store, not financial truth.

### `analyticsCache` (optional)
metric, period, value, calculatedAt, stale flag — always recomputable.

---

## 3. ID & Numbering

Human numbers (searchable):

- `ORD-YYYY-####`, `INV-YYYY-####`, `PAY-YYYY-####`, `DEL-YYYY-####`, `RET-YYYY-####`, `CN-YYYY-####`, `TKT-YYYY-####`

Internal UUIDs for PK. Generators must be monotonic per business where uniqueness required (invoice per stockist).

---

## 4. Derived Data (Never Authoritative)

Compute via `docs/11`:

- Available qty, low stock, expiry bands, invoice outstanding, pair outstanding, unread counts, dashboard KPIs, GST splits, fill rate, etc.

Caches allowed only with invalidation on source writes.

---

## 5. Seed Dataset — ZERO-STATE (REVISED 2026-07-31, supersedes the golden-path seed)

**Binding user directive:** all demo/dummy data deleted; the app starts empty and every dataset is created through the UI. `SEED_VERSION = 3` (the bump wipes existing local DBs once — that is the delete-all mechanism).

Seed EXACTLY (nothing else):

1. **3 businesses** — Platform (`DigiSwasthya Ops`), Stockist (`MedRoute Distributors`), Pharmacy (`CarePlus Chemists`) — all `Active` + **`Approved`** (owners must land in their portals, not `/auth/pending`). Identity fields kept (GST/DL/city/state for GST inference); bank/UPI/servicePins left empty (filled via UI).
2. **3 owner users** matching the login quick-fill buttons verbatim: `admin@digiswasthya.in`/`Admin@2026` (SuperAdmin), `vikram@medroute.in`/`Stockist@2026` (Owner), `neha@careplus.pune.in`/`Pharmacy@2026` (Owner).
3. **2 Approved verification rows** (one per trading business; `documentIds: []`, decision history retained).
4. **1 empty stockist catalogue** (`upsertProduct` fails `CAT_MISSING` without it).
5. **Full `platformSettings` row** (AdminSettings, invite TTL, policy clock depend on it).
6. **`seedMeta` v3** written last.

All other tables **empty**: connections, products, batches, movements, orders, deliveries, invoices, payments, returns, creditNotes, notifications, threads/messages, tickets, announcements, banners, auditLogs, files, carts, wishlists, pharmacyInventory (+ every new table in §9).

`ensureSeeded()` skip condition: `meta.seedVersion === SEED_VERSION && users.count() >= 3` — the old `orderCount >= 3` clause MUST be dropped (with a zero-order seed it re-wipes on every load).

**Document-number counters are derived at boot, not stored:** `hydrateCounters()` scans the max existing `PREFIX-YYYY-NNNN` per series from Dexie and floors the in-memory generators (`nextNumber` stays synchronous). Re-run after `importWorkspace` (which must also stamp `seedMeta` v3, or an imported old export triggers a wipe on next reload). Single-tab assumption logged as G22 in PLAN/12.

**Quick-login panel:** retained on the login page, showing the 3 credentials; login fields default blank.

---

## 5b. Zero-state UI requirement

Every list/dashboard must render a guiding `EmptyState` (CTA toward the next action) at zero data — enumerated sweep in PLAN/13 item P1-5; empty-state copy bank in PLAN/08.

---

## 6. Deletion / Retention Rules (Client Enforcement)

| Entity | Delete behaviour |
|---|---|
| Business | Soft deactivate only if history |
| User | Removed/deactivated; attribution kept |
| Product | Discontinue |
| Issued Invoice/Payment/CN | Never delete |
| Draft Order/Payment/Return/Invoice | Discard allowed |
| Notification | Archive/expire |
| Connection | Disconnect/Block, not erase |

---

## 7. Cross-Entity Integrity Checklist (Persist Guards)

Implement as DB write middleware:

1. Order requires Active connection at create (snapshot connectionId).  
2. Invoice requires billable basis.  
3. Payment allocations ≤ payment & ≤ outstanding.  
4. Return qty ≤ delivered − returned.  
5. Credit ≤ approved return; goodwill/advance CNs require reason/confirm + source flag (CF-39, docs/22).  
6. Inventory never negative; reserved ≤ onHand.  
7. Expired/recalled/quarantined not newly allocated.  
8. Users single-business.  
9. No self-connection / self-trade.  
10. Analytics cannot write source tables.

---

## 8. Auth/Session (Client-Only)

```
login → verify hash → create session { userId, businessId, roles, issuedAt, expiresAt }
persist session token in sessionStorage
route guards read session
logout clears session
suspend/remove → session invalid on next action
password reset → mock OTP → update hash → N-051
```

**Assumption:** Demo OTP is constant `123456` for all users (documented in UI). Not production security (`docs/18` acknowledges product-level security; client demo cannot be real IdP).

---

## 9. New Tables & Field Additions for Canvas-Derived Features (docs/22) — added 2026-07-31

All land in **one** Dexie `version(2)` schema bump (PLAN/13 item P2-20). Workspace export/import iterates `db.tables`, so it inherits them — verify round-trip in e2e. Internal UUID PKs; indexes listed.

| Table | Key fields | Indexes | Feature |
|---|---|---|---|
| `smartOrderRuns` | id, pharmacyId, scope, suggestions[], acceptedLines[], createdBy, createdAt | pharmacyId | CF-01 |
| `customerSales` | id, saleNo (`SALE-YYYY-NNNN`), pharmacyId, customerName, phone?, lines[{productRef, batchAllocations[], qty, unitPrice}], paymentMode, homeDelivery?, address?, status, returnedLines[], createdBy, createdAt | pharmacyId, saleNo | CF-05 |
| `deliveryAreas` | id, pharmacyId, name, pins[] | pharmacyId | CF-06 |
| `pharmacyRoutes` | id, pharmacyId, name, areaId?, assignee?, stops[{saleId, seq, status, failReason?}] | pharmacyId | CF-06 |
| `partnershipApplications` | id, pharmacyId, categories[], volumeBand, consent, status, decisionReason?, decidedBy?, timestamps | pharmacyId, status | CF-07 |
| `partnerInvites` | id, stockistId, name, phone, email?, gst?, status (Sent/Registered/Connected/Withdrawn), createdAt | stockistId, phone | CF-12 |
| `suppliers` | id, stockistId, name, contact, gst?, terms?, active | stockistId | CF-17 |
| `purchaseOrders` | id, poNo, stockistId, supplierId, lines[{productId, qty, expectedCost, receivedQty}], status, statusHistory[], createdAt | stockistId, supplierId, status | CF-17 |
| `purchaseBills` | id, billNo, stockistId, supplierId, date, amount, fileId?, poIds[] | stockistId, supplierId | CF-17 |
| `supplierReturns` | id, retNo, stockistId, supplierId, lines[{batchId, qty, reason}], status, settledNote? | stockistId, status | CF-17 |
| `stockistRoutes` | id, stockistId, name, pins[], assigneeId?, stops[{deliveryId, seq}] | stockistId | CF-18 |
| `upgradeRequests` | id, businessId, plan, utr, proofFileId?, status, decisionReason?, decidedBy?, timestamps | businessId, status, utr | CF-23 |
| `counterfeitReports` | id, reporterBusinessId, productId?, batchId?, sellerBusinessId?, description, evidenceFileIds[], status, assigneeId?, internalNotes[], outcome?, timestamps | status, batchId | CF-24 |
| `priceChanges` | id, stockistId, productId, oldPtr, newPtr, oldMrp?, newMrp?, source (manual/bulk/import), actorId, at | stockistId, productId | CF-20 |
| `favourites` | id, pharmacyId, stockistId, rating?, note? | [pharmacyId+stockistId] | CF-10 |

**Field additions to existing tables:** `orders.source` ('Platform'|'Manual'|'QuickInvoice') + `orders.createdByBusinessId` + `orders.deliveryAddress` + `orders.preferredDeliveryDate` + `orders.grnRecordedAt` (GRN idempotency); `payments.recordedBy` ('Pharmacy'|'Stockist'); `creditNotes.source` ('Return'|'Goodwill'|'Advance') + `creditNotes.paymentId?`; `deliveries.routeId?` + `deliveries.scheduledDate?` + `deliveries.podFileId?` + `deliveries.receivedBy?`; `products.reorderLevel?` + `products.purchaseRate?` + `products.hsn?` + `products.manufacturer?` + `products.genericName?` + `products.rxRequired?` + `products.narcotic?`; `batches.location?` (CF-33 locations-lite); `businesses.holidays[]` + `businesses.preferences{deliverySlots, instructions, defaultReceiver}` + `businesses.plan` ('Free'|'Premium') + `businesses.locations[]`; `users.notificationPreferences{mutedCategories[]}` + `users.onboardingSeenAt?`; `platformSettings.commissionPercent` + `platformSettings.commissionOverrides{}` + `platformSettings.defaultGstPercent` + `platformSettings.maintenanceMode`.

**Static content (no tables):** help/FAQ articles, onboarding slides, medicine reference dataset (CF-36), legal texts — versioned files under `src/content`.

Derived, never stored: commission ledger (CF-22), per-pair ledgers (CF-08/ST-34), transactions register, batch-ordering cycles (CF-35), QR payload (computed from invoice fields).
