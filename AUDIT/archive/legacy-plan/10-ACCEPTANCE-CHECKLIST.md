# Acceptance Criteria Checklist (Per Feature)

Base catalogue: `docs/19` (AC-A01 … AC-P04).  
Expansion rule from Part 18: every Part 8 journey + critical Part 15 edge needs ≥1 measurable AC.

**Usage:** Checkboxes for QA. Pass requires exact business result including what did **not** change. UI cosmetics alone never pass.

---

## A. Authentication & Access

- [x] AC-A01 Login valid user — `e2e/zero-state.spec.ts`
- [ ] AC-A02 Login suspended user  
- [x] AC-A03 Forgot password — `e2e/registration-verification.spec.ts`
- [ ] AC-A04 First login invite  
- [x] AC-A05 Logout — `e2e/workspace.spec.ts` (`signOut`)
- [x] AC-A06 Session timeout requires re-auth (A7) — `store/session.test.ts`
- [ ] AC-A07 Multiple failed logins lockout/backoff (A10)  
- [ ] AC-A08 Inactive invite cannot login (A8)  
- [ ] AC-A09 Password change sends N-051  

---

## B. Registration & Verification

- [x] AC-B01 Pharmacy registration (trade blocked) — `e2e/registration-verification.spec.ts`
- [ ] AC-B02 Stockist registration  
- [x] AC-B03 Submit verification docs → admin queue — `e2e/registration-verification.spec.ts`
- [x] AC-B04 Admin approve → trade enabled — `e2e/registration-verification.spec.ts`
- [ ] AC-B05 Admin reject + reason  
- [x] AC-B06 Duplicate GST blocked/flagged — `e2e/registration-verification.spec.ts`
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
- [x] AC-C05 Delivery boy no financial analytics — `domain/acceptance/acceptance.test.ts` (catalogue.manage deny)
- [ ] AC-C06 Mid-session revoke denies next privileged action (E-B04)  
- [ ] AC-C07 Transfer ownership works; old owner demoted  
- [ ] AC-C08 User cannot belong to two businesses (E-B03)  

---

## D. Connections

- [x] AC-D01 Request connection — `e2e/golden-journey.spec.ts`
- [x] AC-D02 Approve → browse/order — `e2e/golden-journey.spec.ts`
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

- [x] AC-E01 Browse catalogue when connected — `e2e/golden-journey.spec.ts`
- [x] AC-E02 Place order → Pending; no invoice; no stock consume — `e2e/golden-journey.spec.ts`
- [ ] AC-E03 Empty order blocked  
- [x] AC-E04 Accept order — `e2e/golden-journey.spec.ts`
- [ ] AC-E05 Reject order + reason  
- [ ] AC-E06 Cancel eligible + release reserve  
- [ ] AC-E07 Forbidden cancel after dispatch  
- [ ] AC-E08 Double submit → one order  
- [ ] AC-E09 Price snapshot integrity  
- [ ] AC-E10 MOQ / max qty validation  
- [ ] AC-E11 Merge duplicate cart lines  
- [ ] AC-E12 Price change at submit surfaces confirm/block (E-D02)  
- [ ] AC-E13 Inactive product in cart blocks place (E-D01)  
- [x] AC-E14 Suspended business cannot order (E-D09/D10) — `domain/acceptance/acceptance.test.ts`
- [ ] AC-E15 Wishlist item from disconnected stockist not orderable (E-T02)  

---

## F. Fulfilment & Delivery

- [x] AC-F01 Pack order — `e2e/golden-journey.spec.ts`
- [x] AC-F02 Dispatch creates delivery — `e2e/golden-journey.spec.ts`
- [x] AC-F03 Full delivery sync — `e2e/golden-journey.spec.ts`
- [x] AC-F04 Partial delivery quantities — `e2e/long-tail.spec.ts`
- [ ] AC-F05 Failed delivery not counted delivered  
- [x] AC-F06 Expired batch dispatch blocked — `domain/acceptance/acceptance.test.ts` (not sellable)
- [ ] AC-F07 Negative inventory blocked  
- [ ] AC-F08 Pharmacy shortage trail  
- [x] AC-F09 Quarantined/recalled allocation blocked — `domain/acceptance/acceptance.test.ts`
- [x] AC-F10 Failed → Delivered direct forbidden — `domain/acceptance/acceptance.test.ts`
- [ ] AC-F11 Delivery boy cannot open unassigned (E-T08)  
- [ ] AC-F12 Batch expires after reserve → block dispatch (E-F03)  

---

## G. Invoicing

- [x] AC-G01 Issue invoice + outstanding — `e2e/golden-journey.spec.ts`
- [x] AC-G02 Calculation correctness vs `docs/11` — `domain/acceptance/acceptance.test.ts` (AC-O05)
- [ ] AC-G03 Double bill blocked  
- [ ] AC-G04 Invoice before dispatch blocked (default)  
- [ ] AC-G05 Void paid blocked  
- [ ] AC-G06 Issued lines immutable  
- [ ] AC-G07 Invoice qty > billable blocked (E-H02)  
- [ ] AC-G08 Overdue transition by policy clock  
- [ ] AC-G09 Partial fulfilment multi-invoice  

---

## H. Payments & Credit

- [x] AC-H01 Submit payment (no premature settle) — `e2e/golden-journey.spec.ts`
- [x] AC-H02 Approve reduces outstanding correctly — `e2e/golden-journey.spec.ts`
- [ ] AC-H03 Reject no settlement  
- [x] AC-H04 Allocation > outstanding blocked — `domain/acceptance/acceptance.test.ts`
- [ ] AC-H05 Duplicate payment flagged/blocked  
- [x] AC-H06 Pharmacy cannot approve — `domain/acceptance/acceptance.test.ts`
- [x] AC-H07 Apply credit both ledgers — `e2e/golden-journey.spec.ts`
- [x] AC-H08 Credit > outstanding → leftover remains — `domain/acceptance/acceptance.test.ts`
- [ ] AC-H09 Pay after disconnect  
- [ ] AC-H10 Hold then approve/reject  
- [ ] AC-H11 Concurrent payment+credit no negative (E-I04)  
- [ ] AC-H12 Edit amount after submit blocked (E-I06)  

---

## I. Returns & Credit Notes

- [x] AC-I01 Raise return on delivered — `e2e/golden-journey.spec.ts`
- [ ] AC-I02 Undelivered blocked  
- [ ] AC-I03 Qty > delivered blocked  
- [ ] AC-I04 Approve → credit eligibility; invoice lines untouched  
- [x] AC-I05 Issue credit note — `e2e/golden-journey.spec.ts`
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
- [x] AC-K07 Each mandatory N-code fires on trigger (spot-check suite) — `domain/acceptance/acceptance.test.ts` (catalog registration)

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
- [x] AC-M03 Admin cannot create trade order — `domain/acceptance/acceptance.test.ts`
- [ ] AC-M04 Audit records suspension  
- [ ] AC-M05 Ticket resolve no finance mutate  
- [ ] AC-M06 Banner expiry stops display (E-T18)  
- [x] AC-M07 Announcement audience targeting (E-T17) — `e2e/long-tail.spec.ts`

---

## N. State Machine Audits

- [x] AC-N01 Pending → Delivered forbidden — `domain/acceptance/acceptance.test.ts`
- [x] AC-N02 Rejected → Accepted forbidden — `domain/acceptance/acceptance.test.ts`
- [x] AC-N03 Payment Approved → Draft forbidden — `domain/acceptance/acceptance.test.ts`
- [x] AC-N04 Credit Fully Applied → Void forbidden — `domain/acceptance/acceptance.test.ts`
- [x] AC-N05 Accepted → Rejected forbidden (E-E02) — `domain/acceptance/acceptance.test.ts`
- [x] AC-N06 Closed order no operational reopen — `domain/acceptance/acceptance.test.ts`

---

## O. Calculation Audits

- [x] AC-O01 Outstanding 1000−400−100=500 — `domain/acceptance/acceptance.test.ts`
- [x] AC-O02 Available 50−20=30 — `domain/acceptance/acceptance.test.ts`
- [x] AC-O03 GST intra-state split — `domain/acceptance/acceptance.test.ts`
- [x] AC-O04 Remaining credit 200−50=150 — `domain/acceptance/acceptance.test.ts`
- [x] AC-O05 Cart/order/invoice totals golden fixture file — `domain/acceptance/acceptance.test.ts`

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

SW-1 evidence (2026-08-01). Critical/High trade paths covered by automated suites; remaining edge ACs stay open until dedicated tests land.

| JourneyID | Screen / path | Service / suite | AC IDs | Automated? | Pass |
|---|---|---|---|---|---|
| A | Login / logout / session | `e2e/zero-state`, `session.test` | A01,A05,A06 | Y | Pass |
| B | Register → verify → approve | `e2e/registration-verification` | B01,B03,B04,B06 | Y | Pass |
| D | Staff roles (gate sample) | `acceptance.test`, `admin-role-gate` | C05 | Y | Pass |
| E–G | Connect → order → fulfil | `e2e/golden-journey` | E/F/G family | Y | Pass |
| H–I | Invoice → pay → return → CN | `e2e/golden-journey` | H01,H02,H07,I family | Y | Pass |
| J | Payments hold / partials | `e2e/long-tail` | H10 (spot) | Y | Pass |
| L | Inventory / expiry gates | `acceptance.test` | F06,F09 | Y | Pass |
| M–N | Messages / support (smoke) | portals + e2e empty states | — | Partial | Pass |
| O | Analytics / export | report/commission unit + workspace e2e | L/Q family | Y | Pass |
| P | Admin governance | `admin-role-gate`, long-tail announcements | M03,M07 | Y | Pass |
| Q | Suspension / reactivation | unit gates (trade blocked) | E14,M03 | Y | Pass |
| R | Edges / recovery | unit (idempotency, machines) + golden reload | N*,P03 | Y | Pass |
| Workspace | Export/import all tables | `supportService.workspace.test` + `e2e/workspace` | Q20/G22 | Y | Pass |

---

## Q. Canvas-Derived Features (docs/22) — added 2026-07-31

**Ledger-honesty rule:** a box is checked ONLY with automated-test evidence (test file/name annotated). Reconciliation note: before 2026-07-31 this file was all-unchecked while BUILD-STATUS claimed "Done" — BUILD-STATUS has been corrected; this file remains the QA ledger.

- [x] AC-Q01 Smart Order never places an order by itself; accepted lines land in cart only; run history persisted (CF-01) — `smartOrderService.test.ts` (suggestions only)
- [x] AC-Q02 Quick-order parser never silently drops a line — every input line ends Matched, Manually-resolved, or Discarded-by-user (CF-02) — `quickOrderService.test.ts`
- [x] AC-Q03 Manual order (source=Manual) is visible to the pharmacy immediately with cancel rights; source/creator permanently visible (CF-11) — `orderService.manual.test.ts`
- [x] AC-Q04 Offline-recorded payment shows recordedBy=Stockist permanently; duplicate-reference guard applies; outstanding changes only on approval (CF-13) — `paymentService.offline.test.ts`
- [x] AC-Q05 Tampered QR payload (amount changed) verifies as Mismatch naming the field; unknown invoice → Not found (CF-15) — `verifyBillService.test.ts`
- [x] AC-Q06 POS sale cannot drive stock negative and never sells expired/quarantined/recalled batches; void/return restores the same batches (CF-05) — `salesService.test.ts`
- [x] AC-Q07 PO receive increments stock only via movements (batch/expiry/cost captured); supplier return decrements with movement; totals reconcile (CF-17) — `procurementService.test.ts`
- [x] AC-Q08 Commission ledger totals reconcile exactly with the invoice register for identical filters; zero write paths from commission/transactions screens (CF-22) — `commissionService.test.ts`
- [x] AC-Q09 Impersonation: zero mutations possible (service-enforced), reason required, enter/exit audited, banner always visible (CF-25) — `impersonationService.test.ts`
- [x] AC-Q10 Stock transfer writes paired TransferOut/TransferIn movements; total sellable unchanged; cannot exceed un-reserved on-hand (CF-33) — `inventoryService.transfer.test.ts`
- [x] AC-Q11 Goodwill CN requires reason; Advance CN ≤ payment surplus and requires explicit confirmation; both show source to the pharmacy (CF-39) — `creditNote.extra.test.ts`
- [ ] AC-Q12 Marketplace/compare/product-detail show prices and allow add-to-cart ONLY with an Active connection (CF-03/04)
- [x] AC-Q13 Notification preferences mute only non-critical categories; critical/action-required always delivered (CF-30) — `preferencesService.test.ts` + `notificationService.test.ts`
- [x] AC-Q14 Reminders throttled to 1/day/invoice; blocked on settled invoices (CF-14) — `reminderService.test.ts`
- [x] AC-Q15 Role preview changes presentation only — actions executed under preview are authorised and audited as the real user (CF-34) — `store/session.test.ts`
- [ ] AC-Q16 Public catalogue share exposes no PTR and no stock counts (CF-21)
- [x] AC-Q17 Upgrade approval flips plan + badge without altering any trade rule or document (CF-23) — `planService.test.ts`
- [x] AC-Q18 Counterfeit recall marks batch Recalled via the batch machine, notifies holders, releases open reservations (CF-24) — `counterfeitService.test.ts`
- [x] AC-Q19 Zero-state boot: exactly 3 users, all trade tables empty, every list shows a guiding empty state, quick-login works for all 3 roles, reload never re-seeds (G21) — `e2e/zero-state.spec.ts`
- [x] AC-Q20 Document numbers remain unique and monotonic across reloads and workspace import (G22) — `e2e/golden-journey.spec.ts` + `supportService.workspace.test.ts`
