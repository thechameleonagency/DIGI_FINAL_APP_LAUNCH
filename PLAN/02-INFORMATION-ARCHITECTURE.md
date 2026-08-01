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

**~~Omit from nav~~ SUPERSEDED 2026-07-31:** Purchase Orders / Supplier Returns / Suppliers, Subscription and marketplace features are IN nav — see §7 below (`docs/22` CF-17, CF-23, CF-04).

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

**~~Omit or demote~~ SUPERSEDED 2026-07-31:** Platform Ledger/Commission ship as derived read-only monitoring (CF-22); Counterfeit ships as report→investigate→batch-recall console (CF-24) — see §7 below.

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

---

## 7. Canvas-Derived IA Additions (docs/22) — added 2026-07-31

### Pharmacy nav additions
Primary: Buy gains sub-entries **Marketplace** (CF-04), **Compare** (CF-03), **Smart Order** (CF-01), **Quick Order** (CF-02). New primary/More entries: **Sales (POS)** (CF-05) with Areas/Routes (CF-06), **Ledger** per stockist (CF-08, entered from Connections/Stockist detail), **Help** (CF-27). More hub (mobile) lists every secondary page (F14): Wishlist, Invoices, Credit Notes, Returns, Expiry, Addresses, Delivery Preferences (CF-09), Staff, Business, Settings, Privacy/Profile, Notifications, Messages, Support, OTC Partnership (CF-07), Upgrade (CF-23), Reports (CF-26).

### Stockist nav additions
Orders gains **Batch view** (CF-35); Catalogue gains **Bulk Price** (ST-38/CF-20), **Add Item hub**; Delivery gains **Routes / Route execution / Delivery settings** (CF-18); Payments gains **Record Payment** (CF-13), **Bulk Bill / From Orders** (CF-16). More hub groups: **Purchasing** (Suppliers, Purchase Orders, Purchases/GRN, Bill History, Required Stock, Supplier Returns — CF-17), **Billing** (Invoices, Credit Notes incl. goodwill CF-39, Bulk Bill), **Workspace** (Users & Roles w/ role preview CF-34, Documents, Activity Log CF-37, Reports CF-26, Export Data, Export Catalogue CF-21), **Account** (Business, Settings CF-30, Notifications, Subscription CF-23, Holidays CF-19, Help CF-27).

### Admin nav additions
Money group gains **Transactions / Commission** (CF-22); More hub groups: **Trust & safety** (Suspensions, Counterfeit CF-24, Audit), **Content** (Announcements, Banners), **Platform** (Reports CF-26, Plans CF-23, Settings, Notifications, Profile). Business detail offers **View as business** (CF-25, SuperAdmin).

### Shared shell
Topbar: global search (CF-29), messages, bell, profile menu (CF-31). Public (no-login) route: **/verify-bill** (CF-15) and read-only catalogue share route (CF-21).

### Deep-link table additions
Notification/entity deep links extended to: CustomerSale → POS sale detail; PurchaseOrder → PO detail; UpgradeRequest → plans/queue; PartnershipApplication → OTC status/queue; CounterfeitReport → console; CreditNote(Goodwill/Advance) → CN detail; Delivery(scheduled) → delivery card.
