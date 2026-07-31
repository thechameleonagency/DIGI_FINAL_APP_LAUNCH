# DigiSwasthya Demo Script (Stakeholders)

**App:** `app/` · **URL:** http://localhost:5173  
**OTP (forgot password):** `123456`

## Accounts

| Portal | Email | Password |
|---|---|---|
| Admin | admin@digiswasthya.in | Admin@2026 |
| Stockist (MedRoute) | vikram@medroute.in | Stockist@2026 |
| Pharmacy (CarePlus) | neha@careplus.pune.in | Pharmacy@2026 |
| Delivery Boy | amit@medroute.in | Stockist@2026 |
| Unverified pharmacy | kavita@greenleaf.pharmacy.in | Pharmacy@2026 |

## Demo narrative (15 minutes)

### 1) Platform governance (3 min)
1. Login as Admin → Home KPIs.  
2. **Verifications** → Approve GreenLeaf (or Request docs).  
3. **Analytics** → click KPIs for drill-down.  
4. **Suspensions** → show suspend/reactivate (optional).  
5. **Audit** → show suspension/verification actions.

### 2) Connection & buy (3 min)
1. Login as CarePlus.  
2. **Buy** → MedRoute already Active → prices visible.  
3. Add product → **Cart** → Place purchase order.  
4. Show **Orders** search/export.

### 3) Fulfil & deliver (4 min)
1. Login as MedRoute → **Orders** pending first.  
2. Open order → Accept → Allocate (FEFO) → Pack → Issue invoice → Dispatch (assign Amit).  
3. Login as Amit → **Delivery** board → Out for delivery → Delivered.  
4. CarePlus order detail → Record GRN.

### 4) Pay & settle (3 min)
1. CarePlus **Payments** → pay remaining on `INV-2026-0501` (seed partially paid).  
2. MedRoute **Payments** → Approve → outstanding updates.  
3. Both **Analytics** → outstanding reconciles to invoice sum.

### 5) Return & credit (2 min)
1. CarePlus open `ORD-2026-0204` → Raise return.  
2. MedRoute **Returns** → Approve → Issue credit note.  
3. Apply credit to open invoice.

## Out of scope (do not demo as product)
Smart Order AI, B2C customer orders, manufacturer POs, commission ledger, Premium/Subscription.
