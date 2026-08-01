# Domain Rules: State Machines, Calculations, Permissions, Errors

Implement as pure TypeScript modules under `src/domain/`. UI and services must call these — never duplicate transition logic in components.

---

## 1. State Machines

Full tables: `docs/10`. Code structure:

```ts
canTransition(entity, from, to, actor, ctx) → { ok, reason? }
applyTransition(...) → { entity, sideEffects[] }
```

### Machines to implement (complete)

1. Business  
2. Business Verification  
3. User  
4. Connection (include Pharmacy cancel of Requested)  
5. Product  
6. Batch  
7. Inventory availability (derived)  
8. Order  
9. Delivery  
10. Invoice  
11. Payment  
12. Return  
13. Credit Note  
14. Notification  
15. Message  
16. Support Ticket  
17. Catalogue  

### Coupled effects (`docs/10` Cross-Entity)

| Trigger | Effects |
|---|---|
| Connection → non-Active | Block new orders |
| Business → Suspended | Block new trade |
| Order → Accepted | Optional reserve inventory |
| Order → Cancelled/Rejected | Release reservations |
| Delivery → Delivered/Partial | Update Order status |
| Payment → Approved | Recompute invoice outstanding/status |
| Return → Approved | Credit eligibility |
| Credit applied | Reduce invoice outstanding + credit remaining |
| Batch → Expired | Block sellable allocation |

### Forbidden global patterns (assert in tests)

Skip verification; reverse issued finances to draft; chat approvals; negative inventory; deliver expired; reopen Closed/Locked casually; silent status changes without actor+timestamp.

---

## 2. Business Calculations

Module: `docs/11` §§1–30 exactly.

### Must-have functions

- `calcOrderLine`, `calcOrderTotals`  
- `calcInvoiceLine`, `calcInvoiceTotals`, `roundOff`  
- `calcPaymentAllocationValidity`, `invoiceOutstanding`  
- `pairOutstanding`, `pharmacyOutstanding`, `stockistReceivables`  
- `deriveInvoiceStatus`  
- `availableQty`, `productAvailableSellable`  
- `lowStock`, `daysToExpiry`, `expiryRiskBand`  
- `returnValues`, `remainingCredit`, `applyCredit`  
- `cartTotals`, `gstSplit`  
- Analytics: sales, purchasing, supplier performance, customer performance, inventory analytics, platform analytics, notification counts, delivery metrics  

### Guards before persist

Available/Reserved/Outstanding/RemainingCredit invariants; allocation sums; return qty; tax component sums; credit ≤ approved return.

### Money

INR, 2 decimal display; single rounding mode in `platformSettings` (default nearest paisa). Issued totals immutable forever.

### Settlement order (`docs/11` §30)

Validate → apply approved payments → apply credits → recompute outstanding → derive status → update aggregates.

---

## 3. Permissions Engine

Evaluate (`docs/12`):

```
allow = BusinessTypeRole ∩ OperationalRole ∩ ExplicitGrant ∩ !ExplicitDeny
        ∩ BusinessStatusGate ∩ EntityStatusGate ∩ CrossBusinessBoundary
```

Conflict rules §9: deny wins; suspension wins; terminal entity wins; boundary wins; owner-only non-delegable; admin read ≠ financial write.

Implement matrices as data tables:

- Pharmacy internal  
- Stockist internal  
- Admin (Support/Admin/Super)  
- Cross-business  
- Entity action matrices (Order/Invoice/Payment/Return/CN)  
- Export permissions  
- Assignment permissions  

Unit-test every Y/N/C cell with at least one case for C notes.

---

## 4. Error Behaviour Mapping

Map service failures to `docs/17` categories 1–12.

Standard error shape:

```ts
{
  category: 'Validation' | 'Permission' | ...,
  code: 'ORD_EMPTY' | ...,
  message: string,           // business language
  businessImpact: string,    // e.g. "Order was not created."
  fields?: Record<string,string>,
  existingId?: string,       // for duplicate submit
  retrySafe: boolean,
  partial?: { succeeded: [], failed: [] }
}
```

Action-specific tables in `docs/17` for Place Order, Accept, Approve Payment, Issue Invoice, Raise Return, Apply Credit, Allocate Batch — implement all rows.

---

## 5. Edge Cases Registry

Treat `docs/16` sections A–T as mandatory test cases. Tag each with `E-xxx` ID in automated tests.

Priority automation (release bar `docs/18` §18):

- Money integrity (I*, H*, J*, O*)  
- Inventory integrity (F*, Q*)  
- Permission boundaries (B*, L*)  
- Forbidden transitions (N*)  
- Verification/suspension gates (A*, D*, Q*)  
- Delivery/return safety  
- Search isolation  
- Dashboard reconciliation  

---

## 6. Notification Rules

After commit, emit events → template N-001…N-060 (`docs/13`).

- Resolve recipients by role/assignment/creator rules  
- Honour preference disable matrix (mandatory cannot disable)  
- Throttle low-stock per product (E-K04)  
- Never mutate entity from notification actions except mark read/archive  

---

## 7. Search / Filter / Sort / Export

Implement field lists from `docs/14` §§1–19 for every major list. Rules:

- Permission-scoped rows only  
- Filters conjunctive  
- Export = current filter set + audit for financial/admin  
- Stable secondary sort by id  
- Empty result ≠ error  
- Min query length for heavy search (E-S03)  

---

## 8. Clock & SLA Jobs (Client)

Because no backend, run a **foreground scheduler** on app focus/interval:

- Expire batches by date  
- Mark invoices Overdue  
- Expire invites  
- Emit SLA reminder notifications (pending verification/order/payment)  
- Expire credits if policy enabled  
- Expire banners/announcements  
- Draft order TTL discard  

Document that timers pause when tab closed — acceptable for demo; show “last policy run at” in admin settings.

---

## 9. Canvas-Derived Feature Rules (docs/22) — added 2026-07-31

### 9.1 New state machines (same `canTransition`/`applyTransition` contract)

| Machine | States | Notes |
|---|---|---|
| PurchaseOrder (CF-17) | Draft → Sent → PartiallyReceived → Received → Closed; Cancelled from Draft/Sent | Cancel blocked once PartiallyReceived; receive writes stock-in movements |
| CustomerSale (CF-05) | Recorded → Delivered (home delivery) → Returned (partial ok); Voided terminal from Recorded/Delivered | Void/return restores same batches |
| UpgradeRequest (CF-23) | Submitted → Approved / Rejected | One open per business; resubmit after Reject |
| PartnershipApplication (CF-07) | Submitted → UnderReview → Approved / Rejected | Review frozen while business suspended |
| CounterfeitReport (CF-24) | Reported → Investigating → RecallIssued → Resolved; Investigating → Dismissed | RecallIssued drives existing Batch machine → Recalled |
| SupplierReturn (CF-17) | Draft → Sent → Settled; Cancelled from Draft | Sent decrements stock w/ movement |

Existing machines unchanged — Manual orders (CF-11) use the Order machine with `source` flag; recorded payments (CF-13) use the Payment machine with `recordedBy` flag.

### 9.2 New calculations

- **Commission (CF-22):** `commission(invoice) = grandTotal × ratePercent/100` (per-stockist override wins); ledger = Σ over non-void Issued invoices in period. Derived only.
- **QR integrity code (CF-15):** deterministic hash over immutable invoice fields (invoiceNo, stockistId, pharmacyId, grandTotal, issuedAt).
- **Smart-order suggestions (CF-01):** low-stock (onHand ≤ threshold), frequency (≥2 past orders → avg qty rounded), near-expiry replacement (qty of expiring batch); merge same product at max qty.
- **Quick-order parser (CF-02):** line → {phrase, qty}; qty patterns `x10`, `-10`, `qty:10`, trailing/leading count; contains-match on name/brand/SKU of connected active products; tie-break cheapest then alphabetical.
- **Delivery fee (CF-18):** first matching rule in priority order (flat / free-above-threshold); applied as invoice line at issue only.
- **Advance CN amount (CF-39):** `paymentAmount − Σ allocations` (must be > 0, requires confirm).

### 9.3 New permission actions (add rows to matrices in §3; roles per docs/22)

`sale.record` (Ph Owner/Manager/Staff) · `partner.invite` (St Owner/Manager) · `order.recordManual` (St Owner/Manager) · `payment.recordOffline` (St Owner/Manager/Accountant) · `reminder.send` (St Owner/Manager/Accountant) · `supplier.manage`, `po.manage` (St Owner/Manager) · `route.manage` (St Owner/Manager) · `plan.manage` (SuperAdmin) · `counterfeit.report` (business users) · `counterfeit.review` (Admin/SuperAdmin) · `impersonate` (SuperAdmin) · `commission.view` (Admin/SuperAdmin) · `activity.viewOwn` (Owner/Manager).

Rule: UI gating (useCan) may only use actions enforced by services (PLAN/13 risk 7).

### 9.4 Edge-case registry additions

E-CF-01a…E-CF-39b per docs/22 feature sections (empty-input runs, merged suggestions, unmatched-line preservation, gated marketplace, negative-stock sale block, void-after-partial-return, single open application, duplicate invite, disputed recorded payment, reminder throttle, QR mismatch naming, batch-receive expiry match, over-receipt confirm, unassigned route stop, fee-rule immutability, rate-change non-retroactivity, duplicate UTR flag, recall with open reservations, impersonation read-only, number-shaped search priority, transfer ≤ un-reserved, advance ≤ surplus).

### 9.5 Clock additions

Reminder throttling (CF-14, 1/day/invoice) and announcement/banner expiry remain in the §8 scheduler; all new emitters dedupe by (code, entityId).
