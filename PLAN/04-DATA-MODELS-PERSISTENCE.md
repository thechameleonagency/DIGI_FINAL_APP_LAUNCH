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

## 5. Seed Dataset (Demo Golden Path)

Must include (extend canvas seeds CarePlus ↔ MedRoute):

1. Admin user `admin@digiswasthya.in`  
2. Verified Stockist + Owner/Manager/Accountant/Delivery Boy  
3. Verified Pharmacy + Owner/Staff/Accountant  
4. One Active connection  
5. Catalogue ≥ 20 products across categories with batches (healthy, near-expiry, one expired for negative tests)  
6. Sample orders in multiple statuses  
7. Issued invoice partially paid  
8. One returnable delivered order  
9. One open support ticket  
10. Sample announcements/banners  

Unverified second pharmacy for verification queue demos.

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
5. Credit ≤ approved return (+ authorised adjustment none in v1).  
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
