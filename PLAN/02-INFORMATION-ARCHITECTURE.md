# Information Architecture & Navigation

Sources: `docs/15` (dashboard jobs), `docs/9` journeys, navigation from `PharmacyPanel.dc.html`, `StockistPanel.dc.html`, `PlatformAdmin.dc.html`, auth shell in `DigiSwasthya.dc.html`.

---

## 1. Top-Level App Shell

```
/                          → redirect by session
/auth/login
/auth/register
/auth/forgot-password
/auth/reset-password
/auth/invite/:token
/auth/verification-pending   (unverified business holding pattern)
/pharmacy/*                  (BusinessType=Pharmacy)
/stockist/*                  (BusinessType=Stockist)
/admin/*                     (Platform Administrator)
```

**Gate:** After login, route by `user.businessType` / admin flag. Suspended users → denial screen. Unverified businesses → limited shell (profile, docs, support) without trade routes (`docs/12` §6).

---

## 2. Pharmacy IA

### Primary nav (desktop sidebar + mobile bottom nav)

Aligned with canvas:

| Nav | Route prefix | Job |
|---|---|---|
| Home | `/pharmacy` | Operational snapshot + checklist |
| Buy | `/pharmacy/buy/*` | Stockists, catalogues, cart, checkout |
| Orders | `/pharmacy/orders/*` | Order list/detail, GRN, returns entry |
| Inventory | `/pharmacy/inventory/*` | Stock, batches, expiry |
| Payments | `/pharmacy/payments/*` | Invoices, pay, credits |
| Analytics | `/pharmacy/analytics/*` | Purchasing/payment/inventory analytics |
| More | `/pharmacy/more/*` | Secondary tools |

### More / secondary

| Item | Route | Source |
|---|---|---|
| Find Stockist | `/pharmacy/buy/discover` | E1–E3 |
| My Suppliers / Connections | `/pharmacy/connections` | E8 |
| Wishlist | `/pharmacy/buy/wishlist` | F9 |
| Returns | `/pharmacy/returns` | K* |
| Credit Notes | `/pharmacy/payments?tab=credits` | K11 |
| Delivery Addresses | `/pharmacy/settings/addresses` | C2 |
| Delivery Preferences | `/pharmacy/settings/delivery-prefs` | C5 |
| Staff | `/pharmacy/staff` | D* |
| Business Profile | `/pharmacy/business` | C1 |
| Notifications | `/pharmacy/notifications` | M* |
| Messages | `/pharmacy/messages` | M4–M6 |
| Support / Help | `/pharmacy/support` | N* |
| Settings / Privacy | `/pharmacy/settings` | Shared |
| Reports / Export | `/pharmacy/reports` | O7 |
| Profile | `/pharmacy/profile` | A12 |

### Pharmacy Home composition (`docs/15` §1)

- Setup checklist (connect → first order → receive → pay) — canvas pattern, maps to journeys  
- Focal queue cards: Pending Orders, Awaiting Delivery, Outstanding Payables, Overdue, Open Returns, Available Credit, Unread Notifications, Low Stock, Near Expiry  
- Trends: Spend, Orders Placed, Payables Aging, Top Suppliers  
- Empty: discovery CTA if no connections  

---

## 3. Stockist IA

### Primary nav

| Nav | Route prefix | Job |
|---|---|---|
| Home | `/stockist` | Fulfilment + collections queues |
| Pharmacies | `/stockist/pharmacies/*` | Requests, connections, customer terms |
| Orders | `/stockist/orders/*` | Inbox → accept → pack → dispatch |
| Catalogue | `/stockist/catalogue/*` | Products, import/export, pricing |
| Payments | `/stockist/payments/*` | Invoices, payment approvals, credits |
| Delivery | `/stockist/delivery/*` | Routes, assignments, tracking |
| Analytics | `/stockist/analytics/*` | Sales/collections/inventory/ops |
| More | `/stockist/more/*` | Secondary |

### More / secondary (PDD-aligned only)

| Item | Route |
|---|---|
| Inventory / Batches | `/stockist/inventory` |
| Returns queue | `/stockist/returns` |
| Credit Notes | `/stockist/credit-notes` |
| Users & Roles | `/stockist/staff` |
| Documents | `/stockist/documents` |
| Audit Logs (business-scoped) | `/stockist/audit` |
| Reports / Export | `/stockist/reports` |
| Business / Settings | `/stockist/business`, `/stockist/settings` |
| Notifications / Messages | `/stockist/notifications`, `/stockist/messages` |
| Support | `/stockist/support` |
| Holidays / non-delivery days (prefs) | `/stockist/settings/holidays` — maps to delivery settings |

**Omit from nav (out of scope):** Purchase Orders to manufacturers, Mfr Returns, Suppliers factory list, Subscription/Premium, Bulk marketplace features not in PDD.

### Stockist Home (`docs/15` §5)

Cards: New Orders, To Pack, To Dispatch, Out for Delivery, Receivables, Overdue, Payments to Review, Returns to Review, Low Stock, Near Expiry, Connection Requests.

### Delivery Boy entry

Same stockist app, role-filtered: `/stockist/delivery/board` only + notification destinations. No analytics/finance (`docs/15` §10, AC-C05).

---

## 4. Platform Admin IA

| Nav | Route | Job |
|---|---|---|
| Home | `/admin` | Action items |
| Approvals | `/admin/verifications` | Verification queue |
| Network | `/admin/network` | Stockists/Pharmacies directories |
| Orders | `/admin/orders` | Read-only platform orders |
| Money | `/admin/payments` | Read-only payments / anomaly flags |
| Analytics | `/admin/analytics` | Platform KPIs |
| Messages / Support | `/admin/support` | Tickets |
| More | `/admin/more` | Secondary |

### More

| Item | Route | PDD |
|---|---|---|
| Announcements | `/admin/announcements` | P7 |
| Banners | `/admin/banners` | P8 |
| Settings | `/admin/settings` | P9 |
| Audit Log | `/admin/audit` | P10 |
| Suspensions | `/admin/suspensions` | P3 |
| Reports / Export | `/admin/reports` | P15 |
| Profile | `/admin/profile` | Shared |

**Omit or demote:** Platform Ledger double-entry, Commission Setup, Counterfeit module as separate product — not in PDD. Replace Counterfeit with **Recall / Safety investigations** view over Batch Recalled events if needed.

---

## 5. Cross-Portal Entity Deep Links

Notification click destinations (`docs/13`):

| Entity | Pharmacy path | Stockist path | Admin path |
|---|---|---|---|
| Order | `/pharmacy/orders/:no` | `/stockist/orders/:no` | `/admin/orders/:no` |
| Invoice | `/pharmacy/payments/invoices/:no` | `/stockist/payments/invoices/:no` | `/admin/payments?invoice=` |
| Payment | `/pharmacy/payments/:no` | `/stockist/payments/:no` | `/admin/payments/:no` |
| Return | `/pharmacy/returns/:no` | `/stockist/returns/:no` | `/admin/...` |
| Connection | `/pharmacy/connections` | `/stockist/pharmacies/requests` | `/admin/network` |
| Verification | `/pharmacy/business/verification` | `/stockist/business/verification` | `/admin/verifications/:id` |
| Ticket | `/pharmacy/support/:no` | `/stockist/support/:no` | `/admin/support/:no` |
| Delivery | `/pharmacy/orders/:no` (tracking) | `/stockist/delivery/:no` | read-only |

If permission lost → access denied, notification retained (`docs/13` Click Behaviour; E-K01).

---

## 6. Navigation Rules

1. Role + operational role + business status + entity status gate every route (`docs/12`).  
2. Unconnected stockist catalogue → public profile only, no private prices.  
3. Bottom nav on mobile for Pharmacy/Stockist primary destinations (`docs/18` §10).  
4. Admin desktop-primary for heavy config; mobile acceptable for ticket triage.  
5. One primary job per dashboard (`docs/15` principles).
