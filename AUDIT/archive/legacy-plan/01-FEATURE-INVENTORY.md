# Feature Inventory (Mapped to Source Docs)

Every capability below must ship in the no-backend build. Citations use `docs/` paths. (2026-07-31: canvas-derived features added as §Q; the former "Future (Part 19)" deferrals of canvas features are superseded — see §O.)

---

## A. Shared / Platform Foundation

| Feature ID | Feature | Roles | Source |
|---|---|---|---|
| F-AUTH-01 | Register account (choose Pharmacy/Stockist) | New user | `docs/5` Shared; `docs/9` A1,B1,B2 |
| F-AUTH-02 | Login / Logout | All | `docs/5`; `docs/9` A2,A3 |
| F-AUTH-03 | Forgot / reset password | All | `docs/5`; `docs/9` A4,A5; N-051 |
| F-AUTH-04 | Staff invite accept (first login) | Invited staff | `docs/9` A6; N-007 |
| F-AUTH-05 | Session timeout re-login | All | `docs/9` A7; `docs/18` |
| F-AUTH-06 | Failed login lockout handling | All | `docs/9` A10 |
| F-AUTH-07 | Update own profile (name/photo) | All | `docs/9` A12; `docs/5` |
| F-PROF-01 | Manage notification preferences | All | `docs/5`; `docs/13` Preference Rules |
| F-PROF-02 | View activity history | All | `docs/5` Shared |
| F-SUP-01 | Create/view support tickets | All authorised | `docs/5`; `docs/9` N1–N7 |
| F-MSG-01 | Messaging with allowed counterparts | Pharmacy/Stockist | `docs/5`; `docs/9` M4–M6 |
| F-NOT-01 | In-app notifications inbox (N-001…N-060) | All | `docs/13` |
| F-EXP-01 | Export authorised datasets | Per matrix | `docs/5`; `docs/14` |
| F-SEARCH-01 | Global + list search/filter/sort | All | `docs/14` |

---

## B. Business Management & Verification

| Feature ID | Feature | Roles | Source |
|---|---|---|---|
| F-BIZ-01 | Business profile CRUD (permitted fields) | Owner/Manager | `docs/5`; `docs/8` Business |
| F-BIZ-02 | Submit verification documents | Owner/Manager | `docs/5`; `docs/9` B3 |
| F-BIZ-03 | View verification status / resubmit | Business | `docs/9` B8,B9 |
| F-BIZ-04 | Delivery addresses (Pharmacy) | Pharmacy | `docs/5`; `docs/9` C2 |
| F-BIZ-05 | Delivery settings & service areas (Stockist) | Stockist | `docs/5`; `docs/9` C3 |
| F-BIZ-06 | Bank / UPI collection details | Business | `docs/9` C4; canvas fields |
| F-BIZ-07 | Business preferences | Business | `docs/9` C5 |
| F-BIZ-08 | Business activity timeline | Business | `docs/9` C6 |
| F-VER-01 | Admin review queue approve/reject/request docs | Admin | `docs/5` Admin; `docs/9` B4–B7 |
| F-VER-02 | Duplicate GST/phone/license controls | System/Admin | `docs/16` E-A01–A03; AC-B06 |
| F-SUS-01 | Suspend / reactivate / deactivate business | Admin | `docs/9` P3,P4,Q*; `docs/8` |
| F-SUS-02 | Reactivation request from suspended business | Business→Admin | `docs/9` Q7; N-057 |

---

## C. Staff & Permissions

| Feature ID | Feature | Roles | Source |
|---|---|---|---|
| F-STAFF-01 | Invite staff with role | Owner/Manager | `docs/5`; `docs/9` D1 |
| F-STAFF-02 | Assign/change roles & permission overrides | Owner/Manager | `docs/9` D3; `docs/12` |
| F-STAFF-03 | Suspend / reactivate / remove staff | Owner/Manager | `docs/9` D4–D6 |
| F-STAFF-04 | Transfer ownership | Owner only | `docs/9` D7; `docs/12` |
| F-STAFF-05 | Enforce operational matrices (Pharmacy & Stockist) | System | `docs/12` §§1–2 |
| F-STAFF-06 | Delivery Boy limited views | Delivery Boy | `docs/12`; `docs/15` §10; AC-C05 |

Roles: Owner, Manager, Staff, Delivery Boy, Accountant (+ Admin Support Agent / Admin / Super Admin).

---

## D. Discovery & Connections

| Feature ID | Feature | Roles | Source |
|---|---|---|---|
| F-CONN-01 | Search/browse stockists | Pharmacy | `docs/5`; `docs/9` E1; `docs/14` §1 |
| F-CONN-02 | View stockist public/trading profile | Pharmacy | `docs/9` E2 |
| F-CONN-03 | Request / cancel connection | Pharmacy | `docs/9` E3,E4 |
| F-CONN-04 | Approve / reject connection | Stockist | `docs/9` E5–E7 |
| F-CONN-05 | View connected partners | Both | `docs/9` E8 |
| F-CONN-06 | Disconnect / block | Permitted | `docs/9` E9,E10; `docs/8` Connection |
| F-CONN-07 | Stockist search pharmacies / manage relationships | Stockist | `docs/9` E11; `docs/5` |
| F-CONN-08 | Customer-specific terms after connect | Stockist | `docs/9` E14; Connection optional fields |
| F-CONN-09 | Re-request after reject/disconnect | Pharmacy | `docs/9` E12 |
| F-CONN-10 | Gate catalogue pricing when not Active | System | `docs/4` Rel 2; `docs/9` E15 |

---

## E. Catalogue, Cart, Purchasing (Pharmacy)

| Feature ID | Feature | Source |
|---|---|---|
| F-BUY-01 | Browse connected stockist catalogue | `docs/5`; `docs/9` F1 |
| F-BUY-02 | Search / filter / sort products | `docs/9` F2,F3; `docs/14` §3 |
| F-BUY-03 | Product detail (price, pack, tax, availability) | `docs/9` F4 |
| F-BUY-04 | Compare products | `docs/5`; `docs/9` F5 |
| F-BUY-05 | Cart add/update/remove; merge duplicate lines | `docs/9` F6–F8; E-D06 |
| F-BUY-06 | Wishlist / save for later | `docs/5`; `docs/9` F9 |
| F-BUY-07 | Cart review + place purchase order | `docs/6` example; `docs/9` F10,F11 |
| F-BUY-08 | Duplicate previous order / reorder products | `docs/9` F12,F13 |
| F-BUY-09 | MOQ / max qty / empty cart / price recheck | `docs/16` E-D*; `docs/9` F21–F24 |
| F-BUY-10 | Clear cart lines for disconnected stockist | `docs/9` F20; E-T02 |

---

## F. Catalogue Management (Stockist)

| Feature ID | Feature | Source |
|---|---|---|
| F-CAT-01 | Add / edit / deactivate / discontinue products | `docs/5`; `docs/9` F14–F16 |
| F-CAT-02 | Pricing & discounts configuration | `docs/5`; `docs/9` F19 |
| F-CAT-03 | Import catalogue (partial success report) | `docs/9` F17; E-R01 |
| F-CAT-04 | Export catalogue | `docs/9` F18; `docs/14` |
| F-CAT-05 | Catalogue status Active/Maintenance/Inactive | `docs/8`; `docs/10` §17 |
| F-CAT-06 | Categorise products; brands/filters | `docs/5`; canvas categories |

---

## G. Order Lifecycle

| Feature ID | Feature | Actor | Source |
|---|---|---|---|
| F-ORD-01 | View/search/filter orders | Both | `docs/9` G1,G2; `docs/14` §4 |
| F-ORD-02 | Accept / reject pending order | Stockist | `docs/9` G3,G4 |
| F-ORD-03 | Cancel eligible order | Pharmacy/Stockist | `docs/9` G5,G6 |
| F-ORD-04 | Edit pending/accepted lines before lock | Stockist (C) | `docs/9` G7 |
| F-ORD-05 | Track order progress + timeline | Pharmacy | `docs/9` G8 |
| F-ORD-06 | Partial fulfilment preparation | Stockist | `docs/9` G9; `docs/10` |
| F-ORD-07 | Close order when rules met | System/user | `docs/9` G10 |
| F-ORD-08 | Draft edit/discard; notes before accept | Pharmacy | `docs/9` G14,G15,G19 |
| F-ORD-09 | Price snapshot integrity | System | AC-E09; `docs/8` Order |
| F-ORD-10 | Idempotent place-order | System | E-N01; AC-E08 |

---

## H. Fulfilment, Delivery, GRN

| Feature ID | Feature | Source |
|---|---|---|
| F-FUL-01 | Allocate inventory/batches (FEFO preference) | `docs/9` H1; E-F10 |
| F-FUL-02 | Pack order | `docs/9` H2 |
| F-FUL-03 | Generate dispatch / Delivery entity | `docs/9` H3 |
| F-FUL-04 | Assign delivery staff; out for delivery | `docs/9` H4,H5 |
| F-FUL-05 | Complete / partial / failed delivery | `docs/9` H6–H8 |
| F-FUL-06 | Retry failed; multi-trip remainder | `docs/9` H9,H20 |
| F-FUL-07 | Pharmacy record received qty (GRN) | `docs/9` H10 |
| F-FUL-08 | Report shortage / damage | `docs/9` H11,H12; N-026 |
| F-FUL-09 | Manage delivery routes | `docs/9` H13 |
| F-FUL-10 | Delivery Boy board (assigned only) | `docs/15` §10 |
| F-FUL-11 | Block expired/quarantined/recalled allocation | `docs/16` F/Q; `docs/10` Batch |

---

## I. Invoicing

| Feature ID | Feature | Source |
|---|---|---|
| F-INV-01 | Create/issue invoice from billable fulfilment | `docs/9` I1,I2 |
| F-INV-02 | View invoices both sides | `docs/9` I3,I4 |
| F-INV-03 | Overdue system transition | `docs/9` I5; `docs/10` |
| F-INV-04 | Controlled void (pre-settlement rules) | `docs/9` I6 |
| F-INV-05 | Multiple invoices for partial fulfilment | `docs/9` I7 |
| F-INV-06 | Tax/discount/round-off per calculations | `docs/11`; `docs/9` I8–I10 |
| F-INV-07 | Block default pre-dispatch invoice | E-H01; AC-G04 |
| F-INV-08 | Block double billing | E-H03; AC-G03 |
| F-INV-09 | Issued line immutability | AC-G06 |

---

## J. Payments & Credit Application

| Feature ID | Feature | Source |
|---|---|---|
| F-PAY-01 | View outstanding invoices | `docs/9` J1 |
| F-PAY-02 | Submit payment (+ optional/mandatory proof) | `docs/9` J2,J14,J15 |
| F-PAY-03 | Allocate across one/many invoices | `docs/9` J3,J12,J13 |
| F-PAY-04 | Stockist review / approve / reject / hold | `docs/9` J4–J7 |
| F-PAY-05 | Apply available credit notes | `docs/9` J8 |
| F-PAY-06 | Payment history | `docs/9` J9 |
| F-PAY-07 | Duplicate payment detection | `docs/9` J11; E-I01 |
| F-PAY-08 | Historical settlement after disconnect | E-I08; AC-H09 |
| F-PAY-09 | Settlement order: payments + credits | `docs/11` §30 |

---

## K. Returns & Credit Notes

| Feature ID | Feature | Source |
|---|---|---|
| F-RET-01 | Eligible return items from delivered goods | `docs/9` K1 |
| F-RET-02 | Raise return (qty/reason/evidence) | `docs/9` K2 |
| F-RET-03 | Approve / partial approve / reject | `docs/9` K3–K6 |
| F-RET-04 | Goods received back + disposition | `docs/9` K7; E-J07 |
| F-RET-05 | Issue credit note | `docs/9` K8 |
| F-RET-06 | View return/credit history | `docs/9` K10,K11 |
| F-RET-07 | Window expiry / qty caps / no undelivered | E-J01–J03; AC-I* |

---

## L. Inventory & Batches (Both Business Types)

| Feature ID | Feature | Source |
|---|---|---|
| F-INVTRY-01 | View/search/filter inventory & batches | `docs/5`; `docs/14` §§10–11 |
| F-INVTRY-02 | Add stock / create batch | `docs/9` L1 |
| F-INVTRY-03 | Adjustments with mandatory reason | `docs/9` L2; AC-J05 |
| F-INVTRY-04 | Low stock & near-expiry views/alerts | `docs/9` L3,L4; N-042–044 |
| F-INVTRY-05 | Quarantine / recall batch | `docs/9` L5,L6 |
| F-INVTRY-06 | Internal stock transfer (single-pool locations optional field) | `docs/9` L7 — **single warehouse model** |
| F-INVTRY-07 | Pharmacy stock-in on GRN | `docs/9` L8; E-F08 |
| F-INVTRY-08 | Movement history | `docs/9` L10 |
| F-INVTRY-09 | Available = On Hand − Reserved guards | `docs/11` §8 |

---

## M. Analytics & Dashboards

| Feature ID | Feature | Source |
|---|---|---|
| F-DASH-P | Pharmacy Home / Purchasing / Payments / Inventory dashboards | `docs/15` §§1–4 |
| F-DASH-S | Stockist Home / Sales / Collections / Inventory / Ops dashboards | `docs/15` §§5–9 |
| F-DASH-DB | Delivery Boy board | `docs/15` §10 |
| F-DASH-ACC | Accountant-focused subsets | `docs/15` §11 |
| F-DASH-A | Platform Admin + Support Agent dashboards | `docs/15` §§12–13 |
| F-AN-EXP | Export reports | `docs/9` O7; `docs/14` |
| F-AN-TRUST | Analytics stale/recalc; never rewrite source | E-M01; AC-P04 |

KPI formulas: `docs/11` §§17–24; dictionary `docs/15` §14.

---

## N. Platform Administration

| Feature ID | Feature | Source |
|---|---|---|
| F-ADM-01 | Verification queue | `docs/9` P1–P2 |
| F-ADM-02 | Suspend/reactivate/deactivate | `docs/9` P3–P4 |
| F-ADM-03 | View any business/order/payment/return (read) | `docs/9` P5–P6; `docs/12` Admin matrix |
| F-ADM-04 | Announcements & banners | `docs/9` P7–P8; N-050 |
| F-ADM-05 | Platform settings | `docs/9` P9 |
| F-ADM-06 | Audit log review/export | `docs/9` P10,P15; `docs/14` §18 |
| F-ADM-07 | Investigate suspicious activity | `docs/9` P11 |
| F-ADM-08 | Support ticket handling | `docs/9` P12 / N |
| F-ADM-09 | **Cannot** create trade orders or mutate finances | `docs/2`; `docs/12`; AC-M03 |

---

## O. Prototype Canvas Features — Classification (REVISED 2026-07-31)

**Superseding decision (user directive):** every canvas feature is IN SCOPE — nothing deferred or omitted. Features clashing with PDD rules are **adapted** (normative specs in `docs/22`, Part 21); only real external integrations get local equivalents. Item-by-item guarantee: [14-CANVAS-COVERAGE-MATRIX.md](./14-CANVAS-COVERAGE-MATRIX.md).

| Canvas feature | Revised decision |
|---|---|
| Smart Order / AI parsing | **In scope, adapted** — deterministic rule-based reorder assistant + text parser; never auto-places (CF-01, CF-02) |
| Pharmacy Customer Orders (B2C) | **In scope, adapted** — local retail sales ledger (POS) + customer delivery areas/routes; not platform trade (CF-05, CF-06) |
| Stockist POs / Mfr Returns / Suppliers / purchase GRN / bill history | **In scope, adapted** — supplier procurement module; suppliers are local records; inventory effects via movements (CF-17) |
| Platform Commission / Ledger / Transactions | **In scope, adapted** — derived read-only monitoring over invoices/payments; documents remain the only financial truth (CF-22) |
| Counterfeit Management module | **In scope** — report → investigate → batch recall → resolve (CF-24) |
| Upgrade / Subscription / Premium | **In scope, adapted** — plan tiers + UTR/proof upgrade requests, admin-approved; conveniences only (CF-23) |
| OTC Partnership | **In scope, adapted** — application wizard + admin review (CF-07) |
| Marketplace cross-stockist browse | **In scope, adapted** — connection-gated pricing/ordering (CF-04) |
| Stockist "New Order" / "Quick invoice" / "Add Pharmacy" / "Mark Paid" / "Record Payment" | **In scope, adapted** — manual order on behalf (CF-11), partner invite (CF-12), offline payment recording w/ dual-entry (CF-13) |
| QR on bill + verification page | **In scope** — local integrity QR + public verify route (CF-15) |
| Impersonation ("Log in as") | **In scope, adapted** — SuperAdmin-only, read-only, reason + audit (CF-25) |
| Offline mode toggle | **In scope, adapted** — local-first indicator; the app is already fully local (CF-30) |

---

## P. Capability Spec Gap

`docs/6` defines the **specification template** and fully specifies only **Place Purchase Order**. `docs/7` (promised full capability specs) is **missing**.

**Plan resolution:** Implement behaviour from the combination of Parts 5, 7–entity (`docs/8`), 8–journeys (`docs/9`), 9–machines (`docs/10`), 10–calcs (`docs/11`), 11–permissions (`docs/12`), 15–edges (`docs/16`), 16–errors (`docs/17`), 18–AC (`docs/19`). Treat Place Purchase Order in `docs/6` as the gold-standard pattern for every service method.

---

## Q. Canvas-Derived Features (docs/22, Part 21) — added 2026-07-31

All normatively specified in `docs/22`; build sequencing in [13-GAP-CLOSURE-PLAN.md](./13-GAP-CLOSURE-PLAN.md) Phases 11–14.

| Feature ID | Feature | Roles | Source |
|---|---|---|---|
| CF-01 | Smart Order — rule-based reorder assistant (adds to cart only) + run history | Pharmacy order-placers | `docs/22` §CF-01; canvas smart-order |
| CF-02 | Quick Order — pasted text → parsed cart lines (matched/unmatched review) | Pharmacy order-placers | `docs/22` §CF-02 |
| CF-03 | Compare Prices across connected stockists (lowest highlight) | Pharmacy | `docs/22` §CF-03; F-BUY | 
| CF-04 | Marketplace discovery — cross-stockist browse, connection-gated pricing | Pharmacy | `docs/22` §CF-04 |
| CF-05 | Customer Sales / POS — walk-in sales from pharmacy stock (FEFO), void/return | Pharmacy (`sale.record`) | `docs/22` §CF-05 |
| CF-06 | Customer delivery areas & routes (home delivery of sales) | Pharmacy | `docs/22` §CF-06 |
| CF-07 | OTC Partnership application + admin review | Pharmacy Owner / Admin | `docs/22` §CF-07 |
| CF-08 | Per-stockist ledger (derived statement) | Pharmacy | `docs/22` §CF-08 |
| CF-09 | Delivery preferences (slots/instructions/receiver, shown to stockist) | Pharmacy | `docs/22` §CF-09 |
| CF-10 | Favourite stockists + private supplier rating | Pharmacy | `docs/22` §CF-10 |
| CF-11 | Manual order on behalf of connected pharmacy (source=Manual, notified) + Quick Invoice variant | Stockist Owner/Manager | `docs/22` §CF-11 |
| CF-12 | Partner invite ("Add Pharmacy" adapted — registration invites, no records created) | Stockist | `docs/22` §CF-12 |
| CF-13 | Offline payment recording (recordedBy=Stockist, dual-entry preserved) | Stockist | `docs/22` §CF-13 |
| CF-14 | Payment reminders (throttled, logged) | Stockist | `docs/22` §CF-14 |
| CF-15 | QR on bill + public bill-verification route | Stockist issues; public verifies | `docs/22` §CF-15 |
| CF-16 | Bulk bill generation + invoice-from-orders builder (incl. discount at issue) | Stockist billing roles | `docs/22` §CF-16 |
| CF-17 | Supplier procurement: suppliers, POs, receive→stock-in, purchase bills, required stock, supplier returns, bill quick-entry | Stockist | `docs/22` §CF-17 |
| CF-18 | Delivery routes, route execution (maps deep-links), scheduling, delivery-fee rule | Stockist / Delivery Boy | `docs/22` §CF-18 |
| CF-19 | Business holidays (informational) | Stockist | `docs/22` §CF-19 |
| CF-20 | Price history log + view | Stockist | `docs/22` §CF-20 |
| CF-21 | Public catalogue share (no PTR/stock) + link/QR | Stockist | `docs/22` §CF-21 |
| CF-22 | Commission monitor + Transactions view (derived, read-only) + config | Platform Admin | `docs/22` §CF-22 |
| CF-23 | Premium plans + upgrade requests (UTR/proof, admin decision) | Businesses / Admin | `docs/22` §CF-23 |
| CF-24 | Counterfeit management (report → investigate → recall → resolve) | All report; Admin handles | `docs/22` §CF-24 |
| CF-25 | Impersonation — read-only view-as w/ reason + audit | SuperAdmin | `docs/22` §CF-25 |
| CF-26 | Reports hubs (admin / pharmacy / stockist canned CSV exports) | Per matrix | `docs/22` §CF-26 |
| CF-27 | Help Center (FAQ, guides, contact, tickets link, walkthrough replay) | All | `docs/22` §CF-27 |
| CF-28 | Onboarding walkthrough (first login, replayable) | All | `docs/22` §CF-28 |
| CF-29 | Global search (scoped) | All | `docs/22` §CF-29 |
| CF-30 | Preferences & settings toggles (notification mutes, theme, language, local-first indicator, session panel) | All | `docs/22` §CF-30 |
| CF-31 | Profile menu + sign-out confirmation | All | `docs/22` §CF-31 |
| CF-32 | Dashboard interaction parity (actionable KPIs, Today's Work, quick actions, success summaries, checklists) | All | `docs/22` §CF-32 |
| CF-33 | Stock transfer between own locations (paired movements) | Stockist | `docs/22` §CF-33 |
| CF-34 | Role preview (Owner-only, presentation-only) | Owners | `docs/22` §CF-34 |
| CF-35 | Consolidated batch-ordering planning view | Stockist | `docs/22` §CF-35 |
| CF-36 | Product reference autofill (local dataset) | Stockist | `docs/22` §CF-36 |
| CF-37 | Business activity log (own scope) | Owner/Manager | `docs/22` §CF-37 |
| CF-39 | Goodwill & advance credit notes | Stockist | `docs/22` §CF-39 |
