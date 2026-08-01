# 02 — Journeys and Lifecycles

## Roles

| Portal | Roles |
|---|---|
| Admin | SuperAdmin, Admin |
| Stockist | Owner, Manager, Staff, Accountant, DeliveryBoy |
| Pharmacy | Owner, Manager, Staff, Accountant, DeliveryBoy |
| Public | Login, register, invite accept, bill verify, catalogue share |

## Primary journeys

### A. Auth & access
Login → session TTL → lockout → logout. Invite accept. Forgot password OTP. Suspended gate.

### B. Registration & verification
Type pick → wizard → docs → pending workspace → admin approve/reject/request-docs → trade enabled.

### C. Staff
Invite → accept → role change / suspend / remove / ownership transfer. Role preview (Owner UI-only).

### D. Connections (platform pharmacies)
Pharmacy request ↔ stockist approve (credit terms) → browse PTR (inclusive price) → order.

### E. Offline / managed pharmacies (stockist)
Create OfflineManaged → profile/credit → manual order → invoice → offline payment / reminder → optional invite → register → link to Business + Active connection.  
**Or** invite-first (no local ops until Linked).

### F. Catalogue & buying
Stockist: product CRUD with `pricingClass`, stock-in, bulk price, share catalogue.  
Pharmacy: Buy / Marketplace / product detail / compare sheet / quick-order sheet / cart sheet / wishlist sheet / smart order.

### G. Order lifecycle
Pending → Accept(/Partial) → Allocate → Pack → Invoice → Dispatch → OFD → Delivered(/Partial) → GRN → Closed. Cancel/reject with reasons + stock release.

### H. Payments
Submit (pharmacy) or record offline (stockist) → Hold/Approve/Reject. CN apply. Surplus → Advance CN confirm.

### I. Returns & CN
Raise → approve/reject → goods disposition → issue CN → apply.

### J. Admin governance
Verify, suspend/reactivate, announcements/banners, support, counterfeit recall, premium plans, **pricing rates** (not old GMV-% monitor), impersonation read-only, workspace export/import.

## Stage machines (canonical)

Order, Delivery, Invoice, Payment, Return, CreditNote, Batch, Verification, Connection, ManagedPharmacy (`OfflineOnly` → `Invited` → `Linked`).

## Edge cases (must stay covered)

Double-submit idempotency; price change confirm at place; MOQ/max; expired/quarantine/recall blocks; disconnect preserves historical invoices; mute never kills critical notifications; import stamps seed version + hydrates counters.
