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
