# Acceptance Criteria Checklist (Per Feature)

Base catalogue: `docs/19` (AC-A01 … AC-P04).  
Expansion rule from Part 18: every Part 8 journey + critical Part 15 edge needs ≥1 measurable AC.

**Usage:** Checkboxes for QA. Pass requires exact business result including what did **not** change. UI cosmetics alone never pass.

---

## A. Authentication & Access

- [ ] AC-A01 Login valid user  
- [ ] AC-A02 Login suspended user  
- [ ] AC-A03 Forgot password  
- [ ] AC-A04 First login invite  
- [ ] AC-A05 Logout  
- [ ] AC-A06 Session timeout requires re-auth (A7)  
- [ ] AC-A07 Multiple failed logins lockout/backoff (A10)  
- [ ] AC-A08 Inactive invite cannot login (A8)  
- [ ] AC-A09 Password change sends N-051  

---

## B. Registration & Verification

- [ ] AC-B01 Pharmacy registration (trade blocked)  
- [ ] AC-B02 Stockist registration  
- [ ] AC-B03 Submit verification docs → admin queue  
- [ ] AC-B04 Admin approve → trade enabled  
- [ ] AC-B05 Admin reject + reason  
- [ ] AC-B06 Duplicate GST blocked/flagged  
- [ ] AC-B07 Self-approval impossible  
- [ ] AC-B08 Request documents → resubmit → under review  
- [ ] AC-B09 Incomplete docs cannot approve (E-A05)  
- [ ] AC-B10 Expired license not approved (E-A04)  
- [ ] AC-B11 Business type flip blocked after verify (E-A10)  

---

## C. Staff & Permissions

- [ ] AC-C01 Invite staff  
- [ ] AC-C02 Permission deny (payment)  
- [ ] AC-C03 Remove staff preserves history  
- [ ] AC-C04 Cannot remove sole owner  
- [ ] AC-C05 Delivery boy no financial analytics  
- [ ] AC-C06 Mid-session revoke denies next privileged action (E-B04)  
- [ ] AC-C07 Transfer ownership works; old owner demoted  
- [ ] AC-C08 User cannot belong to two businesses (E-B03)  

---

## D. Connections

- [ ] AC-D01 Request connection  
- [ ] AC-D02 Approve → browse/order  
- [ ] AC-D03 Reject + reason; order blocked  
- [ ] AC-D04 Order without connection blocked  
- [ ] AC-D05 Disconnect preserves invoices; blocks new orders  
- [ ] AC-D06 Duplicate Active prevented  
- [ ] AC-D07 Cancel request before decision  
- [ ] AC-D08 Blocked pharmacy cannot see private pricing (E-C08)  
- [ ] AC-D09 Self-connection blocked (E-C05)  
- [ ] AC-D10 Pay historical invoice after disconnect allowed (AC-H09 / E-I08)  

---

## E. Catalogue & Orders

- [ ] AC-E01 Browse catalogue when connected  
- [ ] AC-E02 Place order → Pending; no invoice; no stock consume  
- [ ] AC-E03 Empty order blocked  
- [ ] AC-E04 Accept order  
- [ ] AC-E05 Reject order + reason  
- [ ] AC-E06 Cancel eligible + release reserve  
- [ ] AC-E07 Forbidden cancel after dispatch  
- [ ] AC-E08 Double submit → one order  
- [ ] AC-E09 Price snapshot integrity  
- [ ] AC-E10 MOQ / max qty validation  
- [ ] AC-E11 Merge duplicate cart lines  
- [ ] AC-E12 Price change at submit surfaces confirm/block (E-D02)  
- [ ] AC-E13 Inactive product in cart blocks place (E-D01)  
- [ ] AC-E14 Suspended business cannot order (E-D09/D10)  
- [ ] AC-E15 Wishlist item from disconnected stockist not orderable (E-T02)  

---

## F. Fulfilment & Delivery

- [ ] AC-F01 Pack order  
- [ ] AC-F02 Dispatch creates delivery  
- [ ] AC-F03 Full delivery sync  
- [ ] AC-F04 Partial delivery quantities  
- [ ] AC-F05 Failed delivery not counted delivered  
- [ ] AC-F06 Expired batch dispatch blocked  
- [ ] AC-F07 Negative inventory blocked  
- [ ] AC-F08 Pharmacy shortage trail  
- [ ] AC-F09 Quarantined/recalled allocation blocked  
- [ ] AC-F10 Failed → Delivered direct forbidden  
- [ ] AC-F11 Delivery boy cannot open unassigned (E-T08)  
- [ ] AC-F12 Batch expires after reserve → block dispatch (E-F03)  

---

## G. Invoicing

- [ ] AC-G01 Issue invoice + outstanding  
- [ ] AC-G02 Calculation correctness vs `docs/11`  
- [ ] AC-G03 Double bill blocked  
- [ ] AC-G04 Invoice before dispatch blocked (default)  
- [ ] AC-G05 Void paid blocked  
- [ ] AC-G06 Issued lines immutable  
- [ ] AC-G07 Invoice qty > billable blocked (E-H02)  
- [ ] AC-G08 Overdue transition by policy clock  
- [ ] AC-G09 Partial fulfilment multi-invoice  

---

## H. Payments & Credit

- [ ] AC-H01 Submit payment (no premature settle)  
- [ ] AC-H02 Approve reduces outstanding correctly  
- [ ] AC-H03 Reject no settlement  
- [ ] AC-H04 Allocation > outstanding blocked  
- [ ] AC-H05 Duplicate payment flagged/blocked  
- [ ] AC-H06 Pharmacy cannot approve  
- [ ] AC-H07 Apply credit both ledgers  
- [ ] AC-H08 Credit > outstanding → leftover remains  
- [ ] AC-H09 Pay after disconnect  
- [ ] AC-H10 Hold then approve/reject  
- [ ] AC-H11 Concurrent payment+credit no negative (E-I04)  
- [ ] AC-H12 Edit amount after submit blocked (E-I06)  

---

## I. Returns & Credit Notes

- [ ] AC-I01 Raise return on delivered  
- [ ] AC-I02 Undelivered blocked  
- [ ] AC-I03 Qty > delivered blocked  
- [ ] AC-I04 Approve → credit eligibility; invoice lines untouched  
- [ ] AC-I05 Issue credit note  
- [ ] AC-I06 Credit > approved return blocked  
- [ ] AC-I07 Reject → no credit  
- [ ] AC-I08 Damaged not restocked sellable  
- [ ] AC-I09 Window expired blocked  
- [ ] AC-I10 Duplicate return units blocked (E-J09)  
- [ ] AC-I11 Fully applied CN cannot void (AC-N04)  

---

## J. Inventory & Batches

- [ ] AC-J01 Add batch stock formulas  
- [ ] AC-J02 Low stock flag  
- [ ] AC-J03 Auto expire  
- [ ] AC-J04 Recall blocks allocation  
- [ ] AC-J05 Adjustment requires reason  
- [ ] AC-J06 Pharmacy GRN increases stock when tracking on (E-F08)  
- [ ] AC-J07 Transfer two-sided (E-F09) if locations used  

---

## K. Notifications & Messages

- [ ] AC-K01 Order placed notification  
- [ ] AC-K02 Notification alone does not approve  
- [ ] AC-K03 Message “Approved” ignored  
- [ ] AC-K04 Notify failure doesn’t roll back invoice  
- [ ] AC-K05 Click after permission lost → denied (E-K01)  
- [ ] AC-K06 Low-stock throttle (E-K04)  
- [ ] AC-K07 Each mandatory N-code fires on trigger (spot-check suite)  

---

## L. Search / Export / Dashboard

- [ ] AC-L01 Order search by number  
- [ ] AC-L02 Filter overdue invoices  
- [ ] AC-L03 Export permission deny  
- [ ] AC-L04 Dashboard outstanding = list sum  
- [ ] AC-L05 Cross-business search isolation  
- [ ] AC-L06 Export uses current filters  
- [ ] AC-L07 Analytics mismatch trusts invoices (AC-P04)  

---

## M. Admin Governance

- [ ] AC-M01 Suspend blocks trade; history kept  
- [ ] AC-M02 Reactivate restores trade  
- [ ] AC-M03 Admin cannot create trade order  
- [ ] AC-M04 Audit records suspension  
- [ ] AC-M05 Ticket resolve no finance mutate  
- [ ] AC-M06 Banner expiry stops display (E-T18)  
- [ ] AC-M07 Announcement audience targeting (E-T17)  

---

## N. State Machine Audits

- [ ] AC-N01 Pending → Delivered forbidden  
- [ ] AC-N02 Rejected → Accepted forbidden  
- [ ] AC-N03 Payment Approved → Draft forbidden  
- [ ] AC-N04 Credit Fully Applied → Void forbidden  
- [ ] AC-N05 Accepted → Rejected forbidden (E-E02)  
- [ ] AC-N06 Closed order no operational reopen  

---

## O. Calculation Audits

- [ ] AC-O01 Outstanding 1000−400−100=500  
- [ ] AC-O02 Available 50−20=30  
- [ ] AC-O03 GST intra-state split  
- [ ] AC-O04 Remaining credit 200−50=150  
- [ ] AC-O05 Cart/order/invoice totals golden fixture file  

---

## P. Edge / Concurrency

- [ ] AC-P01 Connection removed mid-pending  
- [ ] AC-P02 Concurrent allocate same stock  
- [ ] AC-P03 Network retry place order idempotent  
- [ ] AC-P04 Analytics mismatch trust source  
- [ ] AC-P05 Double-click approve payment (E-N02)  
- [ ] AC-P06 Accept vs cancel race deterministic (E-N03)  

---

## Journey Coverage Gate

For each journey ID in `docs/9` (A1–R15 + short-form list), maintain a spreadsheet/column:

`JourneyID | Screen | Service | AC IDs | Automated? | Pass`

Phase 9 cannot close with any Critical/High journey lacking AC.
