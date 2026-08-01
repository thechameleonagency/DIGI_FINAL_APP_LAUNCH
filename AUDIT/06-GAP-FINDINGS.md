# 06 — Gap Findings (seed audit 2026-08-01)

## Critical product gaps (driving this change set)

| Finding | Severity | Spec |
|---|---|---|
| No real offline/managed pharmacy entity — invites are CRM stubs only | High | AUDIT/04 §2 |
| Old CF-22 commission is GMV-% monitor, not baked-in trade pricing | High | AUDIT/04 §3 |
| OTC partnership still in pharmacy/admin | High | Remove |
| Product add form missing pricingClass + several compliance fields | High | AUDIT/04 §6 |
| Cart & Wishlist in left nav; should be topbar sheets | Med | AUDIT/04 §4–5 |
| Quick Order & Compare are full pages | Med | AUDIT/04 §5 |
| More hubs are flat link lists | Med | AUDIT/04 §4 |
| Left nav duplicates More destinations | Med | AUDIT/04 §4 |
| Pharmacy product detail exists but entry points inconsistent | Med | AUDIT/04 §6 |
| Quick Invoice single-modal path never shipped | Low | Optional after managed pharmacy |

## Completeness anti-patterns observed

- Features marked Done in PLAN/14 while canvas-alternate surfaces (KPI modal, Quick Bill) remain absent — AUDIT uses exit criteria, not canvas pixel parity.
- Partner invite cannot host orders until Business exists — blocks stockist offline ops.

## Resolution tracking

| Finding | Resolution |
|---|---|
| Offline/managed pharmacy | `ManagedPharmacy` + Pharmacies hub + invite link-on-register |
| Baked-in pricing | `pricingService` + order-line snapshots; admin rates; pharmacy sees inclusive only |
| OTC / CF-22 | Removed routes/services; Dexie drops `partnershipApplications` |
| Product form | pricingClass + Rx/narcotic/purchaseRate/composition/description |
| Cart/Wishlist topbar sheets | AppShell + Sheet primitive |
| Quick Order / Compare | Modals from Buy |
| More hubs | Sectioned `MoreHub` cards |
| Nav overlaps | Slimmed Pharmacy / Stockist / Admin left rails |

Backlog statuses: [05-IMPLEMENTATION-BACKLOG.md](./05-IMPLEMENTATION-BACKLOG.md) — A0–A9 Done.
