# Screens, Layouts, Interactions & User Flows

UI patterns reference design canvases; behaviour must match PDD. For each screen: purpose, layout, components, interactions, empty/loading/error.

---

## Global UI States (All Screens)

| State | Behaviour | Source |
|---|---|---|
| Loading | Skeleton (canvas `dsSkel`) on lists/dashboards | NFR performance |
| Empty | Explicit empty + next CTA (connect / add product / no results) | `docs/15` §17; `docs/14` |
| Validation error | Field + business impact sentence | `docs/17` |
| Permission denied | Dedicated panel, not crash | `docs/17` cat 2; canvas “Permission denied” |
| State conflict | Refresh + retry guidance | `docs/17` cat 3,7 |
| Connectivity | “Couldn’t complete; verify before retry” for create/approve | `docs/17` cat 10; `docs/18` §3 |
| Status display | Text label + color (never color alone) | `docs/18` §9 |

---

## A. Auth & Onboarding Screens

| Screen | Route | Layout / interactions | Journeys |
|---|---|---|---|
| Login | `/auth/login` | Email/phone + password; links to register/forgot; Lexend brand hero signal | A2 |
| Register type | `/auth/register` | Choose Pharmacy vs Stockist | A1,B1,B2 |
| Register wizard | `/auth/register/:type` | Multi-step: identity, business fields (GSTIN, Drug License, address, owner), documents upload (local), bank/UPI optional, service PINs (stockist), TOS | B1–B3 |
| Forgot / OTP mock | `/auth/forgot` | Simulated OTP (fixed demo code in seed) → new password | A4 |
| Invite accept | `/auth/invite/:token` | Set credentials; activate | A6 |
| Verification pending | `/auth/pending` | Status timeline: Submitted / Under Review / Documents Requested; resubmit; sign out | B9,B7,B8 |
| Suspended gate | `/auth/suspended` | Critical message + support CTA | N-005; A2 fail |
| Intro/onboarding tips | modal once | Connect / Order→Receive→Pay cards (canvas) | checklist |

**Fields (Business)** from `docs/8` Business required/optional — all must appear in wizard or profile.

---

## B. Pharmacy Screens

### B1 Home
- Checklist, KPI cards, graphs, recent activity, notifications badge  
- Drill-downs per `docs/15` §1  

### B2 Discover Stockists
- Search/filter: city, connection status, verified only (default)  
- Cards: public profile → Request Connection / View status  
- Empty: “No stockists yet”  

### B3 Stockist detail / Catalogue
- Product grid/list; category chips (Tablets, Capsules, … from canvas ok as taxonomy)  
- Add to cart; wishlist; compare select  
- Inactive connection → no prices / CTA to connect  

### B4 Cart & Checkout
- Line qty editors; merge duplicates; MOQ/max errors  
- Delivery address select; preferred date; notes  
- Order summary using cart calculations (`docs/11` §14)  
- Place Order → success with “what happens next”  

### B5 Orders list & detail
- Tabs/filters by status (`docs/14` §4); default newest  
- Detail: lines, price snapshot, timeline, linked invoice/delivery, cancel if eligible, reorder, message stockist, raise return if delivered  
- GRN modal: received qty, batch/expiry if provided, discrepancy reasons (Short/Damaged/Wrong/Expired/Other)  

### B6 Payments
- Tabs: Outstanding / History / Credits  
- Pay flow: select invoices → amount/method/ref → proof file → allocate → submit  
- Status chips: Submitted, Under Review, Approved, Rejected, On Hold  

### B7 Returns
- Eligible items picker; qty ≤ delivered − already returned  
- Reason required; evidence optional  
- Status tracking  

### B8 Inventory
- Depths: products / batches / movements / expiry  
- Manual add/adjust/remove with reason  
- Low stock / expiry bands  

### B9 Analytics
- Period filters; cards/graphs from `docs/15` §§2–4  
- Export  

### B10 Staff, Addresses, Settings, Messages, Support, Notifications
- Standard CRUD/list patterns with permission gates  

---

## C. Stockist Screens

### C1 Home
- Queue cards + sales/receivables graphs (`docs/15` §5)  
- Quick actions: Fulfil orders, Create bill, Approve payments  

### C2 Pharmacies
- Tabs: Requested / Active / Rejected / Disconnected / Blocked  
- Approve/reject with reason; set credit terms / customer pricing flag  
- Pharmacy detail + outstanding + last order  

### C3 Orders inbox & fulfilment workspace
- Default sort: Pending first  
- Actions by state: Accept, Reject(+reason), Allocate batches, Pack, Create Invoice, Dispatch, Assign delivery  
- Partial accept/fulfil UI when stock insufficient  
- Concurrent accept → first wins conflict toast  

### C4 Catalogue
- Product table; add/edit drawer; status; pricing; import CSV with row error report; export  

### C5 Inventory / Batches
- Stock in, adjust, quarantine, recall, FEFO indicators, movement log  

### C6 Delivery
- Routes; assignment board; status transitions; POD capture (file mock); Delivery Boy board  

### C7 Payments & Invoices
- Issue invoice wizard from billable qty  
- Payment approval queue with proof viewer  
- Hold/reject reasons; credit note issue/apply  

### C8 Returns
- Review queue; partial approve line-level; disposition on goods back  

### C9 Analytics / Reports / Staff / Settings / Comms / Support
- Per `docs/15` §§6–9 and permissions  

---

## D. Admin Screens

### D1 Home
- Pending verifications, docs requested, suspended, open tickets, GMV, active businesses/connections, flagged duplicates  

### D2 Verification review
- Document preview (object URLs); Approve / Reject(+reason) / Request documents; internal notes (not visible to business)  
- Concurrent decision: first commit wins (E-A09)  

### D3 Network directories
- Search businesses; open detail (read); suspend/reactivate actions  

### D4 Orders / Payments (read-only)
- Investigate; no mutate finances  

### D5 Support tickets
- Assign, status machine, resolve/close/reopen  

### D6 Announcements & Banners
- Target by role; schedule; expire; placements: Pharmacy Home, Stockist Home, Pharmacy Buy, All Dashboards (canvas)  

### D7 Audit log
- Search actor/entity/action; export for Super Admin  

### D8 Settings
- Platform config (SLA days, return window days, invite TTL, proof mandatory flag, bill-ahead default OFF, rounding mode, expiry bands) — persisted locally  

---

## E. Critical User Flows (Happy + Edges)

Implement each journey in `docs/9` Journey Index A–R. Below are the must-wire sequences with edge exits.

### Flow 1 — Onboard & Verify
Register → Submit docs → Admin Under Review → (Request docs ↔ Resubmit)* → Approve → Verified  
Fails: duplicate GST/phone; incomplete docs; expired license; self-approve attempt  

### Flow 2 — Connect & Buy
Discover → Request → Stockist Approve → Browse → Cart → Place Order (Pending)  
Fails: unverified/suspended; duplicate request; inactive connection; empty cart; MOQ; price change confirm; double-submit  

### Flow 3 — Fulfil & Deliver
Accept → Reserve/Allocate → Pack → Invoice(Issued) → Assign → Out for Delivery → Delivered → Pharmacy GRN  
Edges: insufficient stock → partial; expired batch block; failed delivery retry; shortage report; connection removed mid-flight policy  

### Flow 4 — Pay & Settle
Pharmacy Submit Payment → Stockist Review → Approve → Invoice Partially Paid/Paid  
Edges: reject/hold; duplicate ref; allocation > outstanding; pay after disconnect; concurrent credit apply  

### Flow 5 — Return & Credit
Eligible items → Submit Return → Approve → (Goods Back) → Credit Note Issued → Apply to invoice  
Edges: qty > delivered; window expired; damaged not restocked sellable; credit > outstanding apply leftover  

### Flow 6 — Governance
Admin Suspend → trade blocked → history retained → Reactivation Pending → Admin Reactivate  
Support ticket never mutates invoice  

### Flow 7 — Staff
Invite → Accept → Role enforce → Revoke mid-session denies next action → Remove preserves attribution  

---

## F. In-Flight Policy Defaults (Assumptions — see file 12)

When PDD says “per policy”, v1 defaults:

| Situation | Default |
|---|---|
| Connection removed with Pending order | Block new orders; Stockist may Reject/Cancel pending; no Accept of new work |
| Connection removed after Accepted | Allow complete fulfilment OR cancel with reason; no new lines |
| Connection removed after Invoice | Settlement + returns remain allowed |
| Business suspended mid-order | Block new trade; in-flight: freeze new accepts; allow reject/cancel; historical payment review allowed |
| Order Closed with open dues | Operational close allowed; invoices remain outstanding |
| Return window | Configurable; default **7 days** from delivery |
| Invite TTL | Configurable; default **7 days** |
| Pending order SLA reminder | Configurable; default **24 hours** |
| Payment proof | Configurable; default **optional** but recommended |
| Bill-ahead invoicing | **OFF** |
| Partial catalogue import | Partial success + error report |
| FEFO | Auto-allocate earliest expiry sellable; override with audit if Manager+ |

---

## G. Screen ↔ Journey Traceability

Every journey ID in `docs/9` (A1–R15 and short-form catalogue) must map to ≥1 screen interaction in the test matrix (`10-ACCEPTANCE-CHECKLIST.md`). Engineering must not ship a journey as “API-only” without UI for its actor.
