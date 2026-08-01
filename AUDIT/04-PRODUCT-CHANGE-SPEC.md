# 04 — Product Change Spec (normative)

Supersedes conflicting notes in archived PLAN and `docs/22` CF-07 / CF-22 for this build.

## 1. Removals

### 1.1 OTC Partnership (all roles)
Delete pharmacy OTC wizard, admin OTC queue, `partnershipApplications` table, N-301/302, More/Business/nav links. No replacement.

### 1.2 Old commission monitor (CF-22)
Delete admin Commission page, `commissionService` GMV-% ledger, Settings “Commission % (monitoring)”, report `commission-summary`, `commissionPercent` / `commissionOverrides`. Replaced by §3.

---

## 2. Managed / offline pharmacies

### Entity `ManagedPharmacy`
- `id`, `stockistId`, `name`, `phone`, `email?`, `gst?`, `drugLicense?`, `address?`, `city?`, `state?`, `pincode?`
- `creditLimit?`, `creditDays?`, `note?`
- `status`: `OfflineOnly` | `Invited` | `Linked`
- `inviteId?`, `linkedBusinessId?`
- `createdAt`, `updatedAt`

### Flows
1. **Offline first** — create ManagedPharmacy → profile → manual orders / invoices / offline payments / reminders (stockist-scoped docs with `managedPharmacyId`).
2. **Invite** — attach/create PartnerInvite; status → Invited; share register link.
3. **Invite-first** — create as Invited with invite; ops unlock after Linked.
4. **Register + link** — on pharmacy registration matching invite → set Linked, create Active connection, preserve history.

Platform-native pharmacies remain `Business` + `Connection` (unchanged).

### Commission class
Orders/invoices for ManagedPharmacy (not Linked platform trade) use **offline flat per line** only (§3.3).

---

## 3. Baked-in pricing commission

### 3.1 Product tag (required)
`Product.pricingClass: 'Generic' | 'Ethical'` — required on create; CSV + form; default `Generic` for legacy rows on migrate.

### 3.2 Platform trade (Active connection to registered pharmacy)
Stockist PTR is base. Pharmacy-visible unit price:

- **Generic:** `inclusive = round(ptr * (1 + genericCommissionPercent/100))`
- **Ethical:** `inclusive = round(ptr + ethicalCommissionFlatPerProduct)` — flat **per line**, not × qty

Pharmacy UI shows only inclusive prices/totals. Never show commission fields to pharmacy.

### 3.3 Offline / managed (not platform schedule)
`commission = offlineManagedFlatPerLine` **per order/invoice line** (default ₹1), regardless of pricingClass.  
Inclusive line handling: add flat into line total or unit snapshot per implementation note in backlog (prefer: `lineCommissionFlat` on line + inclusive unit for display consistency).

### 3.4 Admin rates (`PlatformSettings`)
- `genericCommissionPercent` (default `0.5`)
- `ethicalCommissionFlatPerProduct` (default `1`)
- `offlineManagedFlatPerLine` (default `1`)

Editable on Admin Settings by SuperAdmin/`settings.manage`.

### 3.5 Snapshots
On place order / manual order, each line stores:
`unitPrice` (inclusive), `basePtr`, `commissionAmount` (total for line), `pricingClass`, `commissionMode: 'PlatformGeneric' | 'PlatformEthical' | 'OfflineManaged'`.

Immutable after accept.

### 3.6 Reporting
Admin report: sum of `commissionAmount` from order lines (filters). Not GMV × %.

---

## 4. Nav + More

### Rule
If destination is on More/Settings hub → remove from left nav.

### Pharmacy left nav (keep)
Home, Buy, Marketplace, Smart Order, Sales, Delivery, Orders, Payments, Invoices, Returns, Inventory, Connections, Analytics, Messages, Counterfeit, Activity, More.

### Pharmacy remove from left
Wishlist, Cart, Business, Staff, Notifications, Profile, Support, Help, Reports, Premium, Settings (Settings = More destination).

### Pharmacy topbar
Cart icon + count, Wishlist icon + count (roles with order/wishlist). Also on More.

### Stockist left nav (keep ops; remove confirmed overlaps)
Remove: Business, Profile, Help, Reports. Fold Invites into Pharmacies hub. Move Bulk bill, Procurement, Premium, Counterfeit, Support, Notifications, Activity, Staff to More sections where they clutter.

### Admin
Categorized More hub; remove OTC Partners + Commission from nav; primary rail keeps Verifications, Network, Orders, Payments, key trust tools.

### More UX
Section headers; large cards with title + description + chevron.

---

## 5. Sheets / modals

| Feature | Host |
|---|---|
| Cart | Right sheet (topbar) |
| Wishlist | Right sheet (topbar) |
| Quick Order | Modal/sheet from Buy |
| Compare | Modal/sheet from Buy / product |

Deep-link routes may remain for refresh/share.

---

## 6. Product form fields (stockist)

Required/extended: name, sku, brand, category, packSize, hsn, manufacturer, genericName, composition, mrp, ptr, purchaseRate, gstPercent, moq, maxQty, reorderLevel, **pricingClass**, rxRequired, narcotic, description, status.

Pharmacy product detail must deep-link from Buy/Marketplace cards.
