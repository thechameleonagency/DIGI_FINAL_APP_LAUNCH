# 03 — UI Surface Inventory

Mark each: `Exists` | `Partial` | `Missing` | `Remove`. Updated 2026-08-01 after AUDIT change set.

## Shell (all portals)

| Surface | Status | Notes |
|---|---|---|
| AppShell sidebar | Exists | Slimmed — no More duplicates |
| AppShell topbar search | Exists | |
| Profile menu | Exists | |
| Pharmacy topbar Cart + Wishlist | Exists | Sheets + count badges |
| Toast / SuccessSummary / ConfirmDialog | Exists | |
| Right Sheet primitive | Exists | `Sheet.tsx` — Cart/Wishlist |
| More hub (section cards) | Exists | Pharmacy / Stockist / Admin |

## Pharmacy primary

| Surface | Route / host | Status |
|---|---|---|
| Home | `/pharmacy` | Exists |
| Buy | `/pharmacy/buy` | Exists (inclusive unit prices) |
| Marketplace | `/pharmacy/marketplace` | Exists |
| Smart Order | `/pharmacy/smart-order` | Exists |
| Quick Order | modal from Buy (+ deep-link route) | Exists |
| Compare | modal from Buy (+ deep-link route) | Exists |
| Product detail | `/pharmacy/product/:id` | Exists |
| Cart | topbar sheet + `/pharmacy/cart` | Exists |
| Wishlist | topbar sheet + More + route | Exists |
| Orders / detail / GRN | `/pharmacy/orders` | Exists |
| Payments / Invoices / Returns | | Exists |
| Inventory / Expiry / Sales / Delivery | | Exists |
| Connections / Analytics / Messages | | Exists |
| Counterfeit / Activity | | Exists |
| More: Business, Staff, Profile, Support, Help, Reports, Premium, Notifications, Delivery prefs | | Exists |
| OTC Partnership | | **Removed** |

## Stockist primary

| Surface | Status |
|---|---|
| Home / Orders / Catalogue / Inventory / Delivery / Payments | Exists |
| Manual order / Bulk bill / Procurement / Returns / CN | Exists |
| Pharmacies hub (Offline \| Invited \| Platform) | Exists |
| Managed pharmacy detail + ops | Exists |
| Invites (also via Pharmacies / More) | Exists |
| More: Business, Profile, Help, Reports, Staff, Support, Notifications, Premium, Counterfeit, Activity, Procurement extras | Exists |
| Product form (full fields + pricingClass) | Exists |

## Admin

| Surface | Status |
|---|---|
| Home / Verifications / Network / Orders / Payments / Reports | Exists |
| Pricing rates (settings) | Exists |
| Commission monitor (CF-22) | **Removed** |
| OTC Partners | **Removed** |
| Premium / Counterfeit / Announcements / Banners / Suspensions / Audit / Staff / Support / Help | Exists (via More) |
| More hub categorized | Exists |
| Trade-commission report | Exists |

## Public

Login, register, invite, pending, suspended, verify-bill, catalogue-share — Exists.
