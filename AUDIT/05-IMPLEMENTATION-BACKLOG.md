# 05 — Implementation Backlog

| ID | Package | Exit criterion | Status |
|---|---|---|---|
| A0 | AUDIT docs 00–06 | Files present | Done |
| A1 | Archive PLAN/00–12 → `AUDIT/archive/legacy-plan` | Pointers updated | Done |
| A2 | Remove OTC + CF-22 monitor | Grep clean; build green | Done |
| A3 | Schema: ManagedPharmacy, pricingClass, rates, line snapshots | Dexie v3 bump; export covers tables | Done |
| A4 | Pricing engine + admin rates UI | Unit tests Generic/Ethical/Offline; pharmacy hides commission | Done |
| A5 | Offline pharmacy hub + link-on-register | Create → ops → invite → register → link | Done |
| A6 | Nav slim + More cards + topbar Cart/Wishlist | No confirmed overlaps; badges work | Done |
| A7 | Cart/Wishlist/QuickOrder/Compare sheets | Esc closes; services unchanged | Done |
| A8 | Product form + detail entry points | pricingClass required; detail links | Done |
| A9 | Verify | `npm test` (127), `npm run build` green | Done |

## Evidence (A9)

- `npm test -- --run` → 36 files / 127 tests passed
- `npm run build` → `tsc -b && vite build` succeeded
- Removals: no OTC/Commission routes or services; `partnershipApplications` dropped in Dexie v3; N-301/302 retired
- Pricing: `pricingService.test.ts` covers Generic %, Ethical flat/line, Offline ₹1/line
- Pharmacies hub: `/stockist/pharmacies` Offline | Invited | Platform + managed detail + manual order `?managed=`
- Pharmacy topbar Cart/Wishlist sheets; Buy opens Quick Order / Compare modals

## Test notes

- Pricing: pure function tests in `pricingService.test.ts`.
- Managed pharmacy: create/invite/link wired via `managedPharmacyService` + invite registration match.
- Superseded: PLAN/10 AC-Q08 (old CF-22 ledger) — replaced by trade-commission report from order-line snapshots.
