# 14 — Canvas Coverage Matrix

**Purpose.** Binding user directive (2026-07-31): *nothing that exists in the HTML design canvases may be skipped, removed, or deferred.* This file maps **every screen, panel, modal, button and behaviour** of the four canvases to the item that delivers it, so completeness is checkable. Adapted features are specified in `docs/22` (Part 21); build sequencing lives in [13-GAP-CLOSURE-PLAN.md](./13-GAP-CLOSURE-PLAN.md).

**How to read.**
- **Now** = state in the React app at audit time: `DONE` (works), `PARTIAL` (exists, incomplete), `MISSING` (absent).
- **Covered by** = ledger item(s) in PLAN/13 (PH-/ST-/AD-/P1-/P2-/F-/CF-/T- IDs) that close the row.
- **Adaptation** = only noted where the build intentionally differs from the literal canvas (reason in docs/22 / PLAN/12).
- There are **zero rows marked "skipped/deferred/out-of-scope"**. External-service bits (real OCR/AI/gateways/maps/SMS) map to their local equivalents per docs/22.
- Pure visual styling (colors, fonts, spacing, icon choice, canvas theming props like accent-color/brandName options) is intentionally NOT carried over — the existing React design system is the visual truth. Such rows are listed once per canvas under "Styling-only items".

---

## Section 1 — PharmacyPanel.dc.html (44 views + 9 modals + shell)

### 1.0 Global shell

| Canvas item | Now | Covered by | Adaptation |
|---|---|---|---|
| Sidebar nav w/ active highlight + role label | DONE | — | |
| Sidebar count badges (Orders in-transit, Payments due) | MISSING | CF-32 | badges on nav items |
| Sidebar footer: user chip → Profile, sign-out | PARTIAL | CF-31, F10 | |
| Topbar global search w/ grouped results + no-hits state | MISSING | F13 / CF-29 | |
| "Viewing as tenant" + Exit impersonation | MISSING | CF-25 | read-only impersonation |
| Cart icon + count badge | MISSING | PH-22 | topbar cart shortcut |
| Messages icon shortcut | PARTIAL | ST-49/50 | nav entry exists |
| Notification bell + unread badge | DONE | — | |
| Profile chip dropdown (Profile, Business, Staff, Upgrade, Settings, Privacy, Help, Sign out) | MISSING | CF-31 | |
| Mobile bottom nav (5 tabs) | PARTIAL | F14 | drawer completes reachability |
| Success summary overlay card (post-GRN, post-sale) w/ CTA | MISSING | CF-32 | |
| Global toast (auto-dismiss, X) | DONE | — | |
| Esc closes modal / back-stack navigation | PARTIAL | F1 (modal Esc); browser history covers navStack | |
| Draft/state persistence + view restore | DONE | — | Dexie + routes instead of localStorage hash |

### 1.1 Views

| # | Canvas view | Now | Covered by | Adaptation |
|---|---|---|---|---|
| 1 | Home: setup checklist card (4 steps, click-through) | PARTIAL | CF-32 | |
| 1 | Home: "Today's Work" 5 clickable tiles | MISSING | CF-32, PH-24 | |
| 1 | Home: 3 quick-action cards | PARTIAL | CF-32 | |
| 1 | Home: KPI row (Pending, Outstanding, Overdue, Available Credit) | PARTIAL | PH-24 | |
| 1 | Home: Top Stockists / Active Offers discovery panels | MISSING | CF-32, CF-10 | offers = active announcements/price-drop feed, not fabricated ratings |
| 1 | Home: getting-started empty-state hint + CTA | PARTIAL | PH-24 | |
| 2 | More hub (3 tile groups, all secondary pages) | MISSING | F14 | More = full nav drawer/hub on mobile |
| 3 | Buy: PIN chip, search, connected cards (product count, next delivery), Discover section w/ request states | PARTIAL | PH-2 (bug), PH-41, PH-40 | |
| 3 | Buy header: Smart Order / Create Order / Find Stockist / Compare / My Stockists / Marketplace buttons | MISSING | CF-01, CF-02, PH-21, CF-04 | Create Order modal = quick multi-product add-to-cart (CF-02) |
| 4 | Catalogue: qty stepper, MRP+discount, Add/Update states, expired-blocked, connect-gated request, wishlist toggle states, sticky mini-cart | PARTIAL | PH-22, PH-23 | |
| 4 | Clear-cart confirm on cross-stockist add | DONE-adapted | PH-37 | app keeps one cart per stockist (better than canvas single-cart); Clear Cart button added |
| 5 | Cart: line steppers, remove, Clear Cart, Subtotal/GST/Delivery fee/Total, Proceed to Checkout | PARTIAL | PH-37, PH-17, CF-18 (fee display) | |
| 6 | Checkout: address, preferred date, payment method, credit-headroom banner, validations, Place Order | MISSING | PH-17, ST-29 | payment method recorded as intended mode (Credit/UPI/Bank) |
| 7 | Order-confirm screen ("What happens next") | MISSING | CF-32 | success summary + next steps |
| 8 | GRN screen: per-line qty/batch/expiry, discrepancy reason, invoice photo attach, validations, partial receive, post-GRN return prefill | PARTIAL | PH-7, F17, F2 | modal instead of full page (same fields) |
| 9 | Orders: search, 11-status filter, lifecycle legend, loading/error/retry/empty states, cards w/ payment badge + Due, expandable items, GRN/Return/Reorder/Cancel actions | PARTIAL | PH-19, PH-18, PH-13, PH-38, P1-* | detail page instead of expandable card |
| 10 | Inventory: tabs (Products/Batches/Expiry/FEFO), Add Medicine, mobile cards + desktop table, status badges, FEFO hints | PARTIAL | PH-14, PH-15, PH-16 | |
| 11 | Compare Prices (`ordering`): stockist tabs, per-product compare, lowest-price indicator, connect-gated add | MISSING | PH-21 / CF-03 | |
| 12 | Analytics: 3 drill tiles, monthly purchases chart, top products; Reports + Export buttons | PARTIAL | PH-25, CF-26 | |
| 13 | Smart Order 3-step wizard (paste → parse/resolve unmatched → recommendation cards → add to cart) | MISSING | CF-01, CF-02 | deterministic parser + rule engine ("AI" simulated); recommendation cards = cheapest/fewest-stockists/balanced |
| 14 | Wishlist: move-all-to-cart, View, Remove, price/stockist info | PARTIAL | PH-23 | |
| 15 | Product detail: price card, specs, per-stockist availability, add/wishlist | MISSING | PH-21 | |
| 16 | Delivery Addresses book (default, edit, add) | MISSING | PH-17 | |
| 17 | Delivery Preferences: slot pills, 4 toggles, instructions, save | MISSING | CF-09 | SMS toggle = notification pref (CF-30) |
| 18 | ph-inventory KPI tiles (SKUs, low stock, expiring, stock value) | MISSING | PH-15 | |
| 19 | Staff: cards w/ role badges, Add Staff | PARTIAL | PH-26 / F8 | canvas Cashier role → Staff; Delivery role supported |
| 20 | Returns list: table w/ stockist, reason, CN link, status, amount; New Return | PARTIAL | PH-13 | |
| 21 | Expiry management: 4 band tiles, table, Write off / Mark return actions | MISSING | PH-16 | |
| 22 | ph-routes (customer delivery routes) | MISSING | CF-06 | |
| 23 | ph-areas (serviceable PINs, add/remove, validation) | MISSING | CF-06 | |
| 24 | ph-commissions (commission on sales tiles + table) | MISSING | CF-22 | commission = derived read-only view (admin-configured rate); pharmacy sees its own derived summary |
| 25 | ph-reports (4 report cards w/ export) | MISSING | CF-26 | |
| 26 | ph-export (per-dataset Excel/CSV rows) | PARTIAL | CF-26 | existing list CSVs + reports hub |
| 27 | Find Stockist: "how connections work" panel, search, discovery cards w/ request states | PARTIAL | PH-2, PH-41 | folded into Buy directory |
| 28 | Stockist detail: KPI tiles (products/orders/outstanding/credit), contact, request connection, View Ledger | MISSING | PH-40, PH-39 | |
| 29 | Smart Order history | MISSING | CF-01 | |
| 30 | ph-ledger (per-stockist: purchases/paid/outstanding + signed entries) | MISSING | PH-39 / CF-08 | |
| 31 | Payments: 3 tiles, tabs Invoices/Payments/Credit Notes, per-invoice Pay, settle modal, processing status, empty states | PARTIAL | PH-10, PH-9, PH-11, P1-9, PH-24 | |
| 32 | Notifications page: kind icons, unread highlight, mark all read | PARTIAL | F4/F5 | |
| 33 | Business Details: form incl. workspace brand rename, pharmacy type, DL/GSTIN/PAN/FSSAI | PARTIAL | PH-28, AD-7 (PAN/FSSAI/type fields) | |
| 34 | Settings: 5 toggles (push, email digest, dark, language, offline) | MISSING | CF-30 | offline toggle = local-first indicator (app already local) |
| 35 | Privacy & Security: change password (validations), active sessions | MISSING | F10, CF-30 | sessions = current-session panel |
| 36 | OTC Partnership 3-step wizard (plans, brand selection, review & pay) | MISSING | CF-07 | adapted to application → admin review (no fake payment activation) |
| 37 | Upgrade to Premium (plan card, UPI block, screenshot ≤5MB validation, UTR validation, submit for approval) | MISSING | CF-23, F2 | |
| 38 | My Suppliers: cards w/ rating, favourite heart, order/spend stats, pending-payment box, Browse/View Orders | PARTIAL | PH-41, CF-10, PH-39 | ratings private to pharmacy |
| 39 | Seller detail (marketplace): banner, connection chip, request, product cards | MISSING | CF-04, PH-40 | |
| 40 | Marketplace: cross-stockist product search, seller links, connect-gated add | MISSING | CF-04 | |
| 41 | Customer Orders (B2C): KPI tiles, type/status filters, expandable sale cards, New Sale | MISSING | CF-05 | local retail ledger; no platform trade |
| 42 | Help Center: replay walkthrough, Messages/Call/Guide tiles, FAQ accordion, inline user guide, tickets panel w/ priority | MISSING | CF-27, CF-28, PH-31 | |
| 43 | Chats: thread list w/ unread badges + search, conversation pane, composer | PARTIAL | P1-8, ST-49/50 | |
| 44 | My Profile: edit/save toggle, tabs Store Info / License / Location (PIN feeds Buy chip) | MISSING | F10, PH-28 | |

### 1.2 Modals

| Modal | Now | Covered by | Adaptation |
|---|---|---|---|
| M1 New Return (order/stockist/product/qty/reason + credit preview) | PARTIAL | PH-12, PH-13 | credit preview shown from real unit price |
| M2 Add Staff (name/email/role incl. Delivery) | PARTIAL | PH-26 / F8, AD-16 | invite link instead of temp password |
| M3 Add Medicine (product/batch/qty/MRP/expiry/reason required) | MISSING | PH-14 | |
| M4 Submit Payment Proof (amount/mode/reference/screenshot, CN-applied panel, duplicate-ref + over-amount errors) | PARTIAL | PH-9, PH-11 | |
| M5 Clear-cart confirm | DONE-adapted | PH-37 | per-stockist carts + Clear button |
| M6 Create Order (stockist + line rows) | MISSING | CF-02 | quick add-to-cart modal |
| M7 New Sale (customer/phone validation, FEFO-sorted stock options, expired blocked, stock cap, payment mode, COD) | MISSING | CF-05 | |
| M8 Generic destructive confirm | MISSING | F1 | |
| M9 Create Support Ticket (subject/category/priority/description) | PARTIAL | PH-31 | |

### 1.3 Cross-cutting canvas behaviours

| Behaviour | Now | Covered by | Adaptation |
|---|---|---|---|
| Connection gating on every buy surface | DONE | — | |
| Credit model surfaced (limit − outstanding + CN balance) in checkout/detail/home/payments | MISSING | ST-29, PH-17, PH-24, PH-40 | |
| Order status set incl. Draft/Invoiced/PartiallyDelivered/Closed + payment badges | PARTIAL | PH-19 | "Invoiced" = derived badge (PDD states canonical, per PLAN/12 C8) |
| Inventory movement log (grn / adjustment-in / disposal / sale) | PARTIAL | PH-14, F7 | |
| FEFO ordering + expired exclusion in sale/GRN surfaces | PARTIAL | PH-15, CF-05 | |
| Payment claim → stockist approval loop | DONE | — | |
| Return → credit note loop w/ capped qty | DONE | PH-11/12 polish | |
| CSV export utility + tel: support dial | PARTIAL | CF-26, CF-27 | |
| Onboarding walkthrough replay | MISSING | CF-28 | |

**Styling-only items (intentionally not carried):** accent-color/brandName theming props, icon set choices, exact card layouts/shadows/gradients. The React design system's look is authoritative.

**Coverage statement:** all 44 views, 9 modals, shell elements, and scripted behaviours from the PharmacyPanel inventory are mapped above; zero rows deferred.

---

## Section 2 — StockistPanel.dc.html (70 numbered inventory entries + shell)

### 2.0 Global shell

| Canvas item | Now | Covered by | Adaptation |
|---|---|---|---|
| Sidebar nav + count badges (pending orders, payments to review) | PARTIAL | CF-32 | |
| Topbar global search (orders/invoices/pharmacies/products + page shortcuts) | MISSING | F13 | |
| Profile chip dropdown menu | MISSING | CF-31 | |
| Impersonation banner + exit | MISSING | CF-25 | |
| Permission-denied inline panel + role gating (Packer/Delivery blocked from finance) | MISSING | F6 | RequirePermission page + nav trimming |
| Mobile bottom nav | PARTIAL | F14 | |
| Generic decision modal (10 kinds, required-reason variant) | MISSING | F1 | |
| Success summary card w/ CTA | MISSING | CF-32 | |
| Global toast / Esc / back-stack | DONE | — | |

### 2.1 Views & modals (canvas inventory №)

| № | Canvas item | Now | Covered by | Adaptation |
|---|---|---|---|---|
| 1 | Dashboard: setup checklist, Today's Work tiles, quick actions, Payment Approvals card (Review/Reject/Hold/Approve), Low Stock card, Top Selling, Recent Orders, Recent Activity, Notices card | PARTIAL | CF-32, ST-25/26, ST-42, ST-44/45/46, AD-24, CF-37 | |
| 2 | Pharmacies: search, connected cards (credit block, edit limit, available credit, outstanding, orders pending), Collect/Mark paid, Order/Quick invoice/Remind actions, platform-pharmacies section, orders accordion | PARTIAL | ST-29, ST-33, ST-34, CF-11, CF-13, CF-14 | stockist-initiated "Connect Pharmacy" → CF-12 invite (pharmacy still requests/approves per PDD) |
| 3 | Add Pharmacy modal (full form, GST/license required, credit limit, coordinates) | MISSING | CF-12 | invite record, never a business record; "license = catalogue password" helper not carried (insecure demo hack — replaced by invite links) |
| 4 | Quick Bill / Quick invoice modal (stock-checked, credit-warned, paired order+invoice, CN auto-apply) | MISSING | CF-11 (Quick Invoice variant) | creates Manual order auto-progressed to Invoiced with all standard guards + pharmacy notifications |
| 5 | Create Order modal (pharmacy, date, lines, stock reserve) | MISSING | CF-11 | |
| 6 | Orders list: header buttons (Returns/Delivery/Setup/Purchasing/Batch Ordering/New Order), source + payment filters, status tabs w/ counts, table w/ delivery chip | PARTIAL | ST-17, CF-11, CF-17, CF-18, CF-35 | |
| 7 | Catalogue: Required Stock, Bill OCR, Export, Bulk Price, Add Product buttons; depth tabs; Scan/Bulk/Enhance All; brand/category/expiry/sort filters; Top Products strip; Items to Watch; product grid w/ per-card Add Stock | PARTIAL | ST-35–43, CF-17, CF-21, CF-26, CF-36 | "Enhance All"/AI enrichment → CF-36 local reference autofill |
| 8 | KPI Detail modal (breakdown rows) | MISSING | CF-32 | |
| 9 | Send Reminder modal (amount, prefilled message) | MISSING | CF-14 | in-app notification + message template (WhatsApp deep-link optional) |
| 10 | Quick Action modal: Quick Order text parse / Edit Order / OCR Scan / Bulk Upload / Map Route / Upload Bill | MISSING | CF-02+CF-11, ST-56, CF-17, ST-37, CF-18 | |
| 11 | Bill OCR 3-step wizard (upload → review & match w/ margin apply → done, movements written) | MISSING | CF-17 | "OCR" = structured quick-entry + text parser (steps preserved) |
| 12 | Add Stock modal (±qty + required reason) | PARTIAL | F7 | current stock-in bypasses service — rewired |
| 13 | Add Product modal | PARTIAL | ST-35 | |
| 14 | Payments hub: KPI cards, Pending/Received tabs, Send Reminder + Mark Paid actions, header buttons (Invoices/From Orders/Credit Notes/Bulk Bill/Analytics/Record Payment) | PARTIAL | ST-27, ST-44, CF-13, CF-14, CF-16 | Mark Paid = CF-13 recorded-payment shortcut (dual-entry preserved) |
| 15 | More hub (Purchasing/Billing/Workspace/Account tile groups) | MISSING | F14 | |
| 16 | Add/Edit Product page: Auto Fetch, manufacturer/generic name, purchase rate, batch & compliance (HSN, GST rate, Rx flag, Narcotic flag) | PARTIAL | ST-35, CF-36 | product fields extended in PLAN/04 |
| 17 | Product detail: Adjust Stock, Price History, Transfer, Edit, attribute rows, movement trail table | MISSING | ST-35, ST-41, CF-20, CF-33, F7 | |
| 18 | Bulk Bill Generation (multi-select unbilled orders → batch invoices) | MISSING | CF-16 | |
| 19 | Purchase Bill History | MISSING | CF-17 | |
| 20 | Find Pharmacy (discover + Send Invite states) | MISSING | CF-12 | |
| 21 | Pharmacy Ledger (per-pair KPIs + signed entries) | MISSING | ST-34 | stockist mirror of CF-08 |
| 22 | Serviceable Areas editor (synced with Delivery Settings) | MISSING | ST-52, CF-18 | |
| 23 | Export Catalogue (public link, copy, Excel/PDF/QR) | MISSING | CF-21, CF-26 | |
| 24 | Notifications page + Mark all read | PARTIAL | F4/F5 | |
| 25 | Business Details (live brand rename, type, DL/GSTIN/PAN/FSSAI) | PARTIAL | ST-52 | |
| 26 | Settings toggles (push/email/dark/language/offline) | MISSING | CF-30 | |
| 27 | Privacy & Security (change password w/ validations, sessions) | MISSING | F10, CF-30 | |
| 28 | Help Center (replay walkthrough, tiles, status-colour legend, FAQs, tickets panel) | MISSING | CF-27, CF-28, ST-51 | |
| 29 | Create Ticket modal (category/priority) | PARTIAL | ST-51 | |
| 30 | Chats (threads w/ unread, search, composer) | PARTIAL | P1-8, ST-49/50 | |
| 31 | Invoice from Orders (multi-select + discount % or ₹ + summary) | MISSING | CF-16 | discount at issue included (PDD I9) |
| 32 | Credit Notes list (source return, applied-to suffix, statuses) | PARTIAL | ST-32 | |
| 33 | New Credit Note modal (manual/goodwill) | MISSING | CF-39 | |
| 34 | Delivery Routes cards | MISSING | ST-24, CF-18 | |
| 35 | Expiry Management (5 band tiles, filters, value-at-risk, per-item Return/Dispose) | MISSING | ST-43, CF-17, F7 | |
| 36 | Purchase Orders (table + Receive GRN action → stock + bill row) | MISSING | CF-17 | |
| 37 | Delivery Staff mgmt (KPIs, cards w/ vehicle/area/rating) | MISSING | CF-18, F8 | route assignees; rating = private note |
| 38 | Documents (upload, validity, status chips) | MISSING | ST-52, F2 | |
| 39 | Reports (6 CSV tiles) | MISSING | CF-26 | |
| 40 | Bulk Price Update (scope → adjust → preview → apply) | MISSING | ST-38 | |
| 41 | Batch Management table | PARTIAL | ST-40, ST-41 | |
| 42 | Subscription (plan cards, current chip, billing history) | MISSING | CF-23 | |
| 43 | Holiday Management (add/remove, recurring) | MISSING | CF-19 | |
| 44 | Add Item hub (single/bulk/OCR + template download) | MISSING | ST-37, CF-17, CF-36 | |
| 45 | My Profile (tabs Personal/Bank/Business/Catalogue/Areas) | MISSING | F10, ST-52, CF-21 | |
| 46 | Payment Approvals page (Review/Reject/Hold/Approve, FIFO allocation, overpayment → Advance CN) | PARTIAL | ST-25, ST-26, CF-39 | pharmacy-submitted payments carry explicit allocations; FIFO prefill on recorded payments |
| 47 | Delivery Settings (Dates / Areas / Fee rules tabs) | MISSING | CF-18, ST-52 | |
| 48 | Pharmacy Detail (KPIs, available credit, tabs Orders/Invoices/Reminders/Details) | MISSING | ST-34, ST-29, CF-14 | |
| 49 | Order Detail: fulfilment stepper, state-dependent action bar (Accept w/ credit warn, Reject w/ reason + stock reversal, Pack, Generate Invoice, Route+Driver Dispatch, Mark Delivered), source chip, payment card, Edit Items w/ lock states, Duplicate Order | PARTIAL | ST-12–15, ST-29, CF-18, ST-56, CF-11, CF-32 | |
| 50 | Analytics Dashboard (clickable KPIs, Revenue/Orders/Top-Pharmacies tabs) | PARTIAL | ST-46 | |
| 51 | Pharmacy Approvals queue (license/PIN, statuses) | PARTIAL | ST-33 | |
| 52 | Approval Review modal (read-only fields, document buttons, credit-limit input, Reject w/ reason / Approve & Add) | MISSING | ST-33, F2 | |
| 53 | Payment Review modal (fields grid + proof preview) | MISSING | ST-26 | |
| 54 | Weekly Batch Ordering (cycle KPIs + batched orders) | MISSING | CF-35 | consolidated fulfilment-planning view over real orders |
| 55 | Route Execution (distance card, Google-Maps deep-link, numbered stops, per-stop Mark Delivered) | MISSING | CF-18 | |
| 56 | Returns queue (Restock / Write off / Reject w/ reason → CN) | PARTIAL | ST-30, ST-31, ST-8 | |
| 57 | Manufacturer Returns + New Mfr Return modal | MISSING | CF-17 | |
| 58 | Record Payment page (mode/reference/date, FIFO hint, leftover → Advance CN) | MISSING | CF-13, CF-39 | |
| 59 | Price History table | MISSING | CF-20 | |
| 60 | Batch Expiry Calendar | MISSING | ST-43 | calendar grouping of expiry view |
| 61 | Stock Transfer (from/to location, movements) | MISSING | CF-33 | locations-lite (labels + transfer movements) |
| 62 | Export Data (6 datasets, Excel/CSV) | PARTIAL | CF-26 | |
| 63 | Add Staff form (role/area/vehicle) | MISSING | F8, CF-18 | |
| 64 | Invoices list (status filters incl. Overdue) | PARTIAL | ST-27 | |
| 65 | Bill Detail (parent-order link, Edit-Items gates, Return items, Print/PDF, QR + credit/payment lines + outstanding + trust banner + Preview Verification) | PARTIAL | ST-28, F15, CF-15, ST-56 | |
| 66 | Bill Verification page (Verified/Not recognised + summary) | MISSING | CF-15 | |
| 67 | Add Bill modal (pharmacy, dates, lines → paired order+invoice) | MISSING | CF-11 (Quick Invoice variant) | |
| 68 | Users & Roles: Preview-as-role, per-row role select, designation, Active/Invited, permissions-matrix card, staff-user invite modal, no-login Delivery assignees | PARTIAL | F8, CF-34, CF-18 | canvas roles (Biller/Packer/…) map to PDD roles (Accountant/Staff/DeliveryBoy); matrix card renders docs/12 |
| 69 | Generic lists: Purchases (GRN), Suppliers, Required Stock (+Create PO), Audit Logs | MISSING | CF-17, CF-37 | |
| 70 | Cross-cutting engines: order lifecycle w/ FEFO + credit warns; payments FIFO + advance CN; CN auto-apply; movement-type ledger; CSV utils; role preview; checklist state | PARTIAL | phases 3–5, CF-13, CF-39, F7, CF-26, CF-34, CF-32 | CN auto-apply → CN apply is explicit (chooser) per PDD; auto-apply offered as prompt after CN issue |

**Styling-only items:** brand accent props, card/ribbon styling, chart colors, avatar initials styling.

**Coverage statement:** all 70 inventory entries + shell mapped; zero deferred. Canvas-only concepts that conflicted with PDD (stockist-created pharmacies, silent Mark-Paid, license-as-password, open credit edits without audit) are adapted via CF-11/12/13 + docs/22.

---

## Section 3 — PlatformAdmin.dc.html (21 views + 7 overlays)

### 3.0 Global shell

| Canvas item | Now | Covered by | Adaptation |
|---|---|---|---|
| Sidebar nav (Home/Approvals w/ badge/Network/Orders/Money/Analytics/Messages/More) | PARTIAL | CF-32 (badges), AD-* | |
| Topbar global search (19 page targets + tenant hits) | MISSING | F13 | |
| Profile pill dropdown (Profile/Settings/Audit/Sign out) | MISSING | CF-31 | |
| Mobile bottom nav (5 tabs, grouped active states) | PARTIAL | F14 | |
| Global toast, ESC modal-close priority, skeleton/empty/error CSS patterns | PARTIAL | F1, PH-38 sweep | |

### 3.1 Views

| # | Canvas view | Now | Covered by | Adaptation |
|---|---|---|---|---|
| 1 | Dashboard: Today's Work 4 KPI tiles (Approvals/Settlements/Suspensions/Counterfeit), inline Pending Verifications list w/ per-row Review, risk shortcut cards, Settlements strip | PARTIAL | AD-19, CF-32, CF-24 | |
| 2 | More hub (Finance / Trust & safety / Content / Platform tile groups) | MISSING | F14 | |
| 3 | Approvals queue: search, role tabs w/ counts, guided empty state, rows w/ Review + status | PARTIAL | AD-10 | |
| 4 | Network tenant lists: role tabs, status tabs w/ counts, cards w/ document chips, Details modal (w/ per-doc View), Log-in-as | PARTIAL | AD-20, F2, CF-25 | |
| 5 | Orders oversight: search, status tabs w/ counts, sort, pagination, Details modal w/ invoice doc link | PARTIAL | AD-22 | |
| 6 | Money/payments: KPI cards (Processed / Commission % / Pending), table w/ mode+status badges, Details modal w/ receipt doc | PARTIAL | AD-22, CF-22 | |
| 7 | Reports: 5 export tiles (Revenue/GST/User Growth/Order Analytics/Settlement) w/ audit on export | MISSING | CF-26 | settlement/commission variants = derived views |
| 8 | Messages & Tickets: ticket rows w/ In-progress/Resolve, message inbox + thread panel | PARTIAL | AD-23 | admin messaging = support-thread view tied to tickets |
| 9 | Notifications: mark-all, per-row dismiss, click→linked view | PARTIAL | F4/F5 | |
| 10 | Settings: toggles (Auto-approve docs / Admin Alerts / 2FA / Maintenance Mode) + Commission % + Default GST % + Save w/ audit | PARTIAL | AD-28, CF-22, CF-30 | Auto-approve → "highlight ready-to-approve" flag (accuracy-over-automation, PLAN/12); 2FA → admin login OTP step (demo OTP); Maintenance Mode → platform banner + new-trade block warning |
| 11 | Transactions register (type/date filters, ± amounts) | MISSING | CF-22 | |
| 12 | Platform Ledger (double-entry balances view) | MISSING | CF-22 | derived read-only account balances |
| 13 | Commission Setup (rules table + add-rule form w/ validation) | MISSING | CF-22 | category rules = rate config on derived ledger |
| 14 | Counterfeit Management (report cards, Investigate/Issue recall/Resolve w/ confirm + audit) | MISSING | CF-24 | |
| 15 | Announcements (audience, priority, publish/unpublish toggle, audit) | PARTIAL | AD-24 | |
| 16 | Banner Management (cards, Edit/Pause/Go live/Delete w/ confirm) | MISSING | AD-25 | |
| 17 | Suspensions (table, Reactivate, Suspend Account modal entry) | PARTIAL | AD-26 | |
| 18 | Analytics: Overview/Revenue/Network/Funnel tabs (GMV MTD, AOV, repeat rate, onboarding funnel) | PARTIAL | AD-19, CF-26 | |
| 19 | Audit Log (guided empty state, When/Action/Target/Actor/Reason) | PARTIAL | AD-27 | |
| 20 | Admin Profile (name/phone editable, email/role readonly) | MISSING | AD-12 / F10 | |
| 21 | (view `ledger`/`commission`/`transactions` are #11–13 above) | — | — | |

### 3.2 Overlays

| Overlay | Now | Covered by | Adaptation |
|---|---|---|---|
| A. New/Edit Banner modal (title/placement/period, validation) | MISSING | AD-25 | |
| B. Suspend Account modal (tenant select, impact callout, reason required, audit note) | MISSING | AD-26, F1 | |
| C. Generic admin confirm dialog | MISSING | F1 | |
| D. Review verification modal (doc preview panel + selector, 3-item checklist, decision reason required, Approve/Needs changes/Reject; approve → live directory + walkthrough reset) | PARTIAL | AD-10, F2, CF-28 | |
| E. Detail modal (tenant/order/payment + documents drill-down) | MISSING | AD-20, AD-22 | |
| F. Impersonation modal (reason required, audited, read-only) | MISSING | CF-25 | |
| Global toast | DONE | — | |

**Styling-only items:** accent props, gradient banner placeholders, avatar styling.

**Coverage statement:** all 21 views + 7 overlays + shell mapped; zero deferred. Commission/ledger/transactions are delivered as derived read-only monitoring (docs/22 CF-22) per PDD principle "documents are the only financial truth".

---

---

## Section 4 — DigiSwasthya.dc.html + index.html (launcher / auth / registration / shared shell)

`index.html` is a pure redirect page — no features (styling-only).

| Canvas item | Now | Covered by | Adaptation |
|---|---|---|---|
| Login: email+password, forgot link, create-account link, error messages incl. "no account — create one?" and status routing (suspended/invite/pending/portal) | PARTIAL | P1-3, AD-7, AD-13 | fields default blank; quick-login panel kept per user directive |
| Forgot password 4-step wizard (request by email OR phone w/ masked-email info → 6-digit OTP w/ demo chip → new+confirm password → done) | PARTIAL | AD-7 | single-page flow upgraded to stepped flow with same validations |
| Staff invite acceptance (role/business context copy, min-6 + confirm, auto-login, refresh-safe invite state) | PARTIAL | AD-16 | |
| Pending verification workspace: lock notice, 3-step tracker w/ status labels (incl. needs_changes/rejected), submitted-documents panel, changes-requested panel w/ admin reason, re-upload sub-panel (file types/5MB, resubmit → under_review) | PARTIAL | AD-8, AD-9 | |
| Suspended screen (reason banner, support contact info, back to sign-in) | PARTIAL | AD-11, P1-12 | |
| Registration type picker (2 option cards w/ descriptions) | DONE | — | descriptions = copy polish |
| Registration wizard — step indicator w/ done/current states; stockist 5 steps / pharmacy 4 steps; abandon/cancel/back confirms when dirty | MISSING | AD-7, F1 | |
| Wizard Step: business/pharmacy details (business types, pharmacy types, PAN w/ regex) | PARTIAL | AD-7 | |
| Wizard Step: documents — per-doc upload blocks (type/size validation, uploaded-file cards, remove), per-doc license-number inputs (DL/GSTIN/wholesale/FSSAI/pharmacy cert), required-doc validation | MISSING | AD-8, F2 | |
| Wizard Step: contact & address — owner+designation (pharmacy), phone regex + duplicate-phone check, alternate/WhatsApp phone, inline phone-OTP widget (send/resend/verify, demo OTP), email uniqueness, password, address, State select (36 states) + city datalist + PIN, stockist serviceable-PIN chips | MISSING | AD-7, AD-8 | |
| Wizard Step: bank (stockist required / pharmacy optional) — bank auto-detect from IFSC prefix, account+confirm match, UPI, holder name | MISSING | AD-7 | |
| Wizard: review/complete step — summary rows, 24–48h note, Terms + Privacy consent checkboxes + legal modal, "Open verification workspace" finish | MISSING | AD-7 | |
| Legal modal (T&C / Privacy static text) | MISSING | AD-7 | |
| App-shell dispatch: role → portal routing, per-panel last-view persistence, deep-link guards | DONE | — | React Router + guards |
| Impersonation session plumbing (readOnly flag, reason, brand swap, exit-to-admin, rename tenant) | MISSING | CF-25, PH-28/ST-52 (display name) | |
| Sign-out confirm dialog (used from all panels) | MISSING | CF-31, F1 | |
| Onboarding walkthrough overlay: 4 role-specific slides, progress dots, skip; Phase 2 "complete profile" form; seen-flag per role+email; replay hook | MISSING | CF-28, F10 | |
| Global confirm dialog primitive | MISSING | F1 | |
| Seed: 3 verified users (admin/vikram/neha) + 1 connection + 1 order + 6 invoices ("not demo shortcuts", SEED_VER mechanism, retired-account logout) | PARTIAL | P1-1, P1-2 | **user directive overrides canvas seed**: v3 seeds ONLY the 3 users + zero business data; SEED_VERSION bump = the wipe mechanism |
| DigiDS status-label/tone contract (order labels, badge tones, ₹/date formats) | DONE | — | StatusBadge/formatINR equivalents |
| DigiNav shared bus (orders/payments/connections/returns/CNs/invoices/tickets/notifications/accounts, FIFO allocation, CN application, event→notification matrix) | DONE | F11, CF-39 | Dexie + services are the bus; FIFO/advance-CN per CF-13/CF-39 |
| Validation library (email/phone/PAN/IFSC/PIN/GSTIN/license + normalization + phone-uniqueness) | MISSING | AD-7 | |
| Activation checklists per role (connect/documents/inviteStaff/firstOrder/pay/receive) | PARTIAL | CF-32 | |
| Impersonation tenant profiles (static fake tenants) | — | CF-25 | impersonation targets real businesses only (no fabricated tenants) |

**Styling-only items:** launcher branding/tagline layout, preview-canvas sizing, accent props, icon illustration choices, ds-* CSS class system (React design system is the equivalent).

**Coverage statement:** all launcher/auth/wizard/onboarding/shell/script features mapped; zero deferred.

---

## Completeness rule

When any ledger item in PLAN/13 closes, update the matching rows here (Now → DONE). A canvas behaviour with no row in this file is a defect of this file — add the row, map it, and if no ledger item covers it, add one to PLAN/13. The four canvas inventory extracts this matrix was built from are archived in the audit record of 2026-07-31.
