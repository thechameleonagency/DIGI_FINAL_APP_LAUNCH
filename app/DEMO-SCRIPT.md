# DigiSwasthya Demo Script (Stakeholders)

**App:** `app/` · **URL:** http://localhost:5173  
**OTP (forgot password):** `123456`  
**Seed:** v3 zero-state — exactly 3 accounts, no preloaded trade data.

## Accounts (quick-login panel on login page)

| Portal | Email | Password |
|---|---|---|
| Admin | admin@digiswasthya.in | Admin@2026 |
| Stockist (MedRoute) | vikram@medroute.in | Stockist@2026 |
| Pharmacy (CarePlus) | neha@careplus.pune.in | Pharmacy@2026 |

## Demo reset

1. Open DevTools → Application → IndexedDB → delete `DigiSwasthyaDB`.  
2. Reload the app — seed v3 recreates the 3 accounts and empty workspace.  
3. Or bump is automatic when `SEED_VERSION` changes; day-to-day reloads do **not** wipe user-created data.

## Demo narrative from zero (≈20 minutes)

### 1) Empty workspace + admin (3 min)
1. Login as Admin (quick-login) → Home / Network shows MedRoute + CarePlus only.  
2. **Verifications** → queue empty (both trading businesses already Approved).  
3. **Support / Audit / Notifications** → guiding empty states.  
4. Optional: register a new pharmacy → pending → Start review → Approve → they reach portal.

### 2) Stockist catalogue & stock (3 min)
1. Login as MedRoute.  
2. **Catalogue** → Add product (name/SKU/brand/MRP/PTR/MOQ) → Save.  
3. **Inventory** → Stock in (batch, future expiry, qty) → Add stock.  
4. Optional: **Staff** → Invite a DeliveryBoy for later dispatch.

### 3) Connect & buy (4 min)
1. Login as CarePlus.  
2. **Buy** → MedRoute → Request connection.  
3. Switch to MedRoute → **Pharmacies** (Requested) → Approve.  
4. CarePlus → Browse → Add → **Cart** → Place purchase order.  
5. Show empty-state CTAs elsewhere before first trade (Returns, Inventory, Notifications).

### 4) Fulfil & deliver (5 min)
1. MedRoute → **Orders** → open Pending order.  
2. Accept → Allocate (FEFO) → Pack → Issue invoice → Dispatch (assign rider if invited).  
3. **Delivery** → Out for delivery → Mark delivered.  
4. CarePlus order detail → Record GRN.

### 5) Pay, return, credit (5 min)
1. CarePlus **Payments** → Outstanding → enter amount → Submit payment.  
2. MedRoute **Payments** → Approve.  
3. CarePlus order → Raise return (qty 1).  
4. MedRoute **Returns** → Approve → Issue credit note → **Credit notes** → Apply.

### 6) Counters & workspace (optional)
1. Place a second order after reload — document numbers stay sequential (`ORD-YYYY-0002`).  
2. Admin **Settings** → Export workspace / Import paste → accounts survive reload.

## Out of scope for this script (later plan phases)
Smart Order, Marketplace, POS, supplier POs, commission monitor, Premium, impersonation — specified in `docs/22`, built in PLAN/13 Phases 11–14.
