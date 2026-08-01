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
| Sidebar count badges (Orders in-transit, Payments due) | PARTIAL | CF-32 | KPI deep-links on homes; nav item badges not painted |
| Sidebar footer: user chip → Profile, sign-out | DONE | CF-31, F10 | + topbar ProfileMenu |
| Topbar global search w/ grouped results + no-hits state | DONE | F13 / CF-29 | GlobalSearch in AppShell |
| "Viewing as tenant" + Exit impersonation | DONE | CF-25 | AppShell banner + exit |
| Cart icon + count badge | PARTIAL | PH-22 | Cart in sidebar + sticky mini-cart on catalogue; no topbar badge |
| Messages icon shortcut | PARTIAL | ST-49/50 | nav entry exists |
| Notification bell + unread badge | DONE | — | |
| Profile chip dropdown (Profile, Business, Staff, Upgrade, Settings, Privacy, Help, Sign out) | DONE | CF-31 | topbar Profile menu (Profile/Settings/Help/Sign out w/ confirm) |
| Mobile bottom nav (5 tabs) | PARTIAL | F14 | drawer completes reachability |
| Success summary overlay card (post-GRN, post-sale) w/ CTA | DONE | CF-32 | SuccessSummaryHost; place order / GRN / payment |
| Global toast (auto-dismiss, X) | DONE | — | |
| Esc closes modal / back-stack navigation | PARTIAL | F1 (modal Esc); browser history covers navStack | |
| Draft/state persistence + view restore | DONE | — | Dexie + routes instead of localStorage hash |

### 1.1 Views

| # | Canvas view | Now | Covered by | Adaptation |
|---|---|---|---|---|
| 1 | Home: setup checklist card (4 steps, click-through) | DONE | CF-32 | until verified + connected |
| 1 | Home: "Today's Work" 5 clickable tiles | DONE | CF-32, PH-24 | Receive / Pay / Low stock (+ deep-link KPIs) |
| 1 | Home: 3 quick-action cards | DONE | CF-32 | New order / Record sale / Invite staff |
| 1 | Home: KPI row (Pending, Outstanding, Overdue, Available Credit) | DONE | PH-24 | deep-linked tiles + aging/suppliers graphs |
| 1 | Home: Top Stockists / Active Offers discovery panels | PARTIAL | CF-32, CF-10 | Top suppliers chart + AnnouncementStrip; not canvas discovery panels |
| 1 | Home: getting-started empty-state hint + CTA | DONE | PH-24 | zero-connection CTA |
| 2 | More hub (3 tile groups, all secondary pages) | PARTIAL | F14 | `/pharmacy/more` → settings shortcuts; not canvas tile groups |
| 3 | Buy: PIN chip, search, connected cards (product count, next delivery), Discover section w/ request states | PARTIAL | PH-2 (bug), PH-41, PH-40 | |
| 3 | Buy header: Smart Order / Create Order / Find Stockist / Compare / My Stockists / Marketplace buttons | DONE-adapted | CF-01 ✓, CF-02 ✓, PH-21 ✓, CF-04 ✓ | Smart/Quick/Marketplace/Compare on Buy; Find Stockist folded into Buy directory |
| 4 | Catalogue: qty stepper, MRP+discount, Add/Update states, expired-blocked, connect-gated request, wishlist toggle states, sticky mini-cart | DONE | PH-22, PH-23 | |
| 4 | Clear-cart confirm on cross-stockist add | DONE-adapted | PH-37 | app keeps one cart per stockist (better than canvas single-cart); Clear Cart button added |
| 5 | Cart: line steppers, remove, Clear Cart, Subtotal/GST/Delivery fee/Total, Proceed to Checkout | PARTIAL | PH-37, PH-17, CF-18 (fee display) | |
| 6 | Checkout: address, preferred date, payment method, credit-headroom banner, validations, Place Order | PARTIAL | PH-17, ST-29 | Cart checkout: address + preferred date + place; payment method / credit banner not on checkout |
| 7 | Order-confirm screen ("What happens next") | DONE | CF-32 | success summary + next steps |
| 8 | GRN screen: per-line qty/batch/expiry, discrepancy reason, invoice photo attach, validations, partial receive, post-GRN return prefill | PARTIAL | PH-7 ✓, F17 ✓, F2 | modal instead of full page (same fields); invoice photo via F2 still open |
| 9 | Orders: search, 11-status filter, lifecycle legend, loading/error/retry/empty states, cards w/ payment badge + Due, expandable items, GRN/Return/Reorder/Cancel actions | PARTIAL | PH-19, PH-18, PH-13, PH-38, P1-* | detail page instead of expandable card |
| 10 | Inventory: tabs (Products/Batches/Expiry/FEFO), Add Medicine, mobile cards + desktop table, status badges, FEFO hints | PARTIAL | PH-14, PH-15, PH-16 | |
| 11 | Compare Prices (`ordering`): stockist tabs, per-product compare, lowest-price indicator, connect-gated add | DONE | PH-21 / CF-03 | |
| 12 | Analytics: 3 drill tiles, monthly purchases chart, top products; Reports + Export buttons | DONE | PH-25, CF-26 | period + supplier perf + aging + CSV; report hub cards remain CF-26 |
| 13 | Smart Order 3-step wizard (paste → parse/resolve unmatched → recommendation cards → add to cart) | DONE-adapted | CF-01 ✓, CF-02 ✓ | CF-01 scope wizard + CF-02 Quick Order paste/parse (separate routes; docs/22 split) |
| 14 | Wishlist: move-all-to-cart, View, Remove, price/stockist info | DONE | PH-23 | |
| 15 | Product detail: price card, specs, per-stockist availability, add/wishlist | DONE | PH-21 | `/pharmacy/product/:productId` |
| 16 | Delivery Addresses book (default, edit, add) | PARTIAL | PH-17 | Add/select/remove on cart checkout (no standalone book page) |
| 17 | Delivery Preferences: slot pills, 4 toggles, instructions, save | DONE-adapted | CF-09 | slots + instructions + receiver; shown to stockist; SMS = CF-30 |
| 18 | ph-inventory KPI tiles (SKUs, low stock, expiring, stock value) | DONE | PH-15 | PharmacyInventory KPI row |
| 19 | Staff: cards w/ role badges, Add Staff | PARTIAL | PH-26 / F8 | canvas Cashier role → Staff; Delivery role supported |
| 20 | Returns list: table w/ stockist, reason, CN link, status, amount; New Return | PARTIAL | PH-13 | |
| 21 | Expiry management: 4 band tiles, table, Write off / Mark return actions | DONE | PH-16 | `/pharmacy/expiry` |
| 22 | ph-routes (customer delivery routes) | DONE | CF-06 | `/pharmacy/delivery` Routes + board |
| 23 | ph-areas (serviceable PINs, add/remove, validation) | DONE | CF-06 | 6-digit PIN validation |
| 24 | ph-commissions (commission on sales tiles + table) | PARTIAL | CF-22 | admin derived ledger/rates Done; pharmacy own summary via filterable admin parity deferred to analytics/report if needed |
| 25 | ph-reports (4 report cards w/ export) | DONE | CF-26 | `/pharmacy/reports` |
| 26 | ph-export (per-dataset Excel/CSV rows) | DONE | CF-26 | reports hub + list CSVs |
| 27 | Find Stockist: "how connections work" panel, search, discovery cards w/ request states | PARTIAL | PH-2, PH-41 | folded into Buy directory |
| 28 | Stockist detail: KPI tiles (products/orders/outstanding/credit), contact, request connection, View Ledger | DONE | PH-40, PH-39 | |
| 29 | Smart Order history | DONE | CF-01 | |
| 30 | ph-ledger (per-stockist: purchases/paid/outstanding + signed entries) | DONE | PH-39 / CF-08 | |
| 31 | Payments: 3 tiles, tabs Invoices/Payments/Credit Notes, per-invoice Pay, settle modal, processing status, empty states | PARTIAL | PH-10, PH-9, PH-11, P1-9, PH-24 | |
| 32 | Notifications page: kind icons, unread highlight, mark all read | PARTIAL | F4/F5 | |
| 33 | Business Details: form incl. workspace brand rename, pharmacy type, DL/GSTIN/PAN/FSSAI | PARTIAL | PH-28, AD-7 (PAN/FSSAI/type fields) | |
| 34 | Settings: 5 toggles (push, email digest, dark, language, offline) | DONE | CF-30 | PreferencesPanel on Profile/Settings (mute/theme/language/local-first) |
| 35 | Privacy & Security: change password (validations), active sessions | DONE | F10, CF-30 | ProfileSecurityPage + PreferencesPanel |
| 36 | OTC Partnership 3-step wizard (plans, brand selection, review & pay) | DONE-adapted | CF-07 | application → admin review (no fake payment); badge on business |
| 37 | Upgrade to Premium (plan card, UPI block, screenshot ≤5MB validation, UTR validation, submit for approval) | DONE | CF-23, F2 | `/pharmacy/upgrade` + `/stockist/upgrade` |
| 38 | My Suppliers: cards w/ rating, favourite heart, order/spend stats, pending-payment box, Browse/View Orders | PARTIAL | PH-41 ✓, CF-10, PH-39 ✓ | ratings/favourites remain CF-10 |
| 39 | Seller detail (marketplace): banner, connection chip, request, product cards | DONE | CF-04, PH-40 | seller → `/pharmacy/stockists/:id` |
| 40 | Marketplace: cross-stockist product search, seller links, connect-gated add | DONE | CF-04 | connection-gated price + add |
| 41 | Customer Orders (B2C): KPI tiles, type/status filters, expandable sale cards, New Sale | DONE-adapted | CF-05 | `/pharmacy/sales` list + New Sale modal + detail (void/return) |
| 42 | Help Center: replay walkthrough, Messages/Call/Guide tiles, FAQ accordion, inline user guide, tickets panel w/ priority | DONE | CF-27, CF-28, PH-31 | `/pharmacy/help` |
| 43 | Chats: thread list w/ unread badges + search, conversation pane, composer | PARTIAL | P1-8 ✓, ST-49/50 | |
| 44 | My Profile: edit/save toggle, tabs Store Info / License / Location (PIN feeds Buy chip) | PARTIAL | F10, PH-28 | ProfileSecurity + prefs; business fields on `/pharmacy/business` |

### 1.2 Modals

| Modal | Now | Covered by | Adaptation |
|---|---|---|---|
| M1 New Return (order/stockist/product/qty/reason + credit preview) | PARTIAL | PH-12, PH-13 | credit preview shown from real unit price |
| M2 Add Staff (name/email/role incl. Delivery) | PARTIAL | PH-26 / F8, AD-16 | invite link instead of temp password |
| M3 Add Medicine (product/batch/qty/MRP/expiry/reason required) | DONE | PH-14 | PharmacyInventory Add medicine modal |
| M4 Submit Payment Proof (amount/mode/reference/screenshot, CN-applied panel, duplicate-ref + over-amount errors) | PARTIAL | PH-9, PH-11 | |
| M5 Clear-cart confirm | DONE-adapted | PH-37 | per-stockist carts + Clear button |
| M6 Create Order (stockist + line rows) | DONE-adapted | CF-02 | `/pharmacy/quick-order` page (not modal) |
| M7 New Sale (customer/phone validation, FEFO-sorted stock options, expired blocked, stock cap, payment mode, COD) | DONE-adapted | CF-05 | Cash/UPI/Credit; COD mapped to Credit; expired blocked; stock cap |
| M8 Generic destructive confirm | DONE | F1 | ConfirmDialog |
| M9 Create Support Ticket (subject/category/priority/description) | PARTIAL | PH-31 | |

### 1.3 Cross-cutting canvas behaviours

| Behaviour | Now | Covered by | Adaptation |
|---|---|---|---|
| Connection gating on every buy surface | DONE | — | |
| Credit model surfaced (limit − outstanding + CN balance) in checkout/detail/home/payments | PARTIAL | ST-29, PH-17, PH-24, PH-40 | Home + stockist detail; not on checkout strip |
| Order status set incl. Draft/Invoiced/PartiallyDelivered/Closed + payment badges | PARTIAL | PH-19 | "Invoiced" = derived badge (PDD states canonical, per PLAN/12 C8) |
| Inventory movement log (grn / adjustment-in / disposal / sale) | PARTIAL | PH-14, F7 | |
| FEFO ordering + expired exclusion in sale/GRN surfaces | PARTIAL | PH-15, CF-05 | |
| Payment claim → stockist approval loop | DONE | — | |
| Return → credit note loop w/ capped qty | DONE | PH-11/12 polish | |
| CSV export utility + tel: support dial | PARTIAL | CF-26, CF-27 | |
| Onboarding walkthrough replay | DONE | CF-28 | Help + topbar Replay tour |

**Styling-only items (intentionally not carried):** accent-color/brandName theming props, icon set choices, exact card layouts/shadows/gradients. The React design system's look is authoritative.

**Coverage statement:** all 44 views, 9 modals, shell elements, and scripted behaviours from the PharmacyPanel inventory are mapped above; zero rows deferred.

---

## Section 2 — StockistPanel.dc.html (70 numbered inventory entries + shell)

### 2.0 Global shell

| Canvas item | Now | Covered by | Adaptation |
|---|---|---|---|
| Sidebar nav + count badges (pending orders, payments to review) | PARTIAL | CF-32 | |
| Topbar global search (orders/invoices/pharmacies/products + page shortcuts) | DONE | F13 | GlobalSearch in AppShell |
| Profile chip dropdown menu | DONE | CF-31 | topbar ProfileMenu |
| Impersonation banner + exit | DONE | CF-25 | |
| Permission-denied inline panel + role gating (Packer/Delivery blocked from finance) | DONE | F6 | RequirePermission page + nav trimming |
| Mobile bottom nav | PARTIAL | F14 | |
| Generic decision modal (10 kinds, required-reason variant) | DONE | F1 | ConfirmDialog + requireReason on order/payments/delivery |
| Success summary card w/ CTA | DONE | CF-32 | shared SuccessSummaryHost |
| Global toast / Esc / back-stack | DONE | — | |

### 2.1 Views & modals (canvas inventory №)

| № | Canvas item | Now | Covered by | Adaptation |
|---|---|---|---|---|
| 1 | Dashboard: setup checklist, Today's Work tiles, quick actions, Payment Approvals card (Review/Reject/Hold/Approve), Low Stock card, Top Selling, Recent Orders, Recent Activity, Notices card | DONE | CF-32, ST-25/26, ST-42, ST-44/45/46, AD-24, CF-37 | Today's Work + Quick Actions + KPI deep-links; activity → `/stockist/activity` |
| 2 | Pharmacies: search, connected cards (credit block, edit limit, available credit, outstanding, orders pending), Collect/Mark paid, Order/Quick invoice/Remind actions, platform-pharmacies section, orders accordion | PARTIAL | ST-29, ST-33, ST-34, CF-11, CF-13, CF-14 | stockist-initiated "Connect Pharmacy" → CF-12 invite (pharmacy still requests/approves per PDD) |
| 3 | Add Pharmacy modal (full form, GST/license required, credit limit, coordinates) | DONE | CF-12 | invite record, never a business record; "license = catalogue password" helper not carried (insecure demo hack — replaced by invite links) |
| 4 | Quick Bill / Quick invoice modal (stock-checked, credit-warned, paired order+invoice, CN auto-apply) | PARTIAL | CF-11 (Quick Invoice variant) | Manual order + issue invoice covers path; no single Quick Invoice modal |
| 5 | Create Order modal (pharmacy, date, lines, stock reserve) | DONE-adapted | CF-11 | `/stockist/manual-order` page (not modal) |
| 6 | Orders list: header buttons (Returns/Delivery/Setup/Purchasing/Batch Ordering/New Order), source + payment filters, status tabs w/ counts, table w/ delivery chip | PARTIAL | ST-17, CF-11, CF-17, CF-18, CF-35 | |
| 7 | Catalogue: Required Stock, Bill OCR, Export, Bulk Price, Add Product buttons; depth tabs; Scan/Bulk/Enhance All; brand/category/expiry/sort filters; Top Products strip; Items to Watch; product grid w/ per-card Add Stock | PARTIAL | ST-35–43, CF-17, CF-21, CF-26, CF-36 | "Enhance All"/AI enrichment → CF-36 local reference autofill |
| 8 | KPI Detail modal (breakdown rows) | PARTIAL | CF-32 | KPI deep-links satisfy CF-32 exit; no breakdown modal |
| 9 | Send Reminder modal (amount, prefilled message) | DONE | CF-14 | in-app notification + message template (WhatsApp deep-link optional) |
| 10 | Quick Action modal: Quick Order text parse / Edit Order / OCR Scan / Bulk Upload / Map Route / Upload Bill | PARTIAL | CF-02+CF-11, ST-56, CF-17, ST-37, CF-18 | Features via dedicated routes/pages; no single suite modal |
| 11 | Bill OCR 3-step wizard (upload → review & match w/ margin apply → done, movements written) | DONE | CF-17 | "OCR" = structured quick-entry + text parser (steps preserved) |
| 12 | Add Stock modal (±qty + required reason) | PARTIAL | F7 | current stock-in bypasses service — rewired |
| 13 | Add Product modal | DONE | ST-35 | |
| 14 | Payments hub: KPI cards, Pending/Received tabs, Send Reminder + Mark Paid actions, header buttons (Invoices/From Orders/Credit Notes/Bulk Bill/Analytics/Record Payment) | PARTIAL | ST-27, ST-44, CF-13, CF-14, CF-16 | Mark Paid + Record Payment = CF-13 (dual-entry preserved); Send Reminder → CF-14 |
| 15 | More hub (Purchasing/Billing/Workspace/Account tile groups) | PARTIAL | F14 | Settings shortcuts hub on mobile More |
| 16 | Add/Edit Product page: Auto Fetch, manufacturer/generic name, purchase rate, batch & compliance (HSN, GST rate, Rx flag, Narcotic flag) | PARTIAL | ST-35, CF-36 | product fields extended in PLAN/04 |
| 17 | Product detail: Adjust Stock, Price History, Transfer, Edit, attribute rows, movement trail table | PARTIAL | ST-35, ST-41, CF-20, CF-33, F7 | Inline catalogue edit + inventory transfer/movements/price history (no dedicated product detail route) |
| 18 | Bulk Bill Generation (multi-select unbilled orders → batch invoices) | DONE | CF-16 | |
| 19 | Purchase Bill History | DONE | CF-17 | |
| 20 | Find Pharmacy (discover + Send Invite states) | DONE | CF-12 | |
| 21 | Pharmacy Ledger (per-pair KPIs + signed entries) | PARTIAL | ST-34 | Pharmacy detail KPIs/orders/invoices; signed ledger mirror = pharmacy-side CF-08 |
| 22 | Serviceable Areas editor (synced with Delivery Settings) | DONE | ST-52, CF-18 | PIN chips on `/stockist/business` |
| 23 | Export Catalogue (public link, copy, Excel/PDF/QR) | DONE | CF-21, CF-26 | Share link + CSV; public `/catalogue-share/:id` (MRP only) |
| 24 | Notifications page + Mark all read | PARTIAL | F4/F5 | |
| 25 | Business Details (live brand rename, type, DL/GSTIN/PAN/FSSAI) | PARTIAL | ST-52 | |
| 26 | Settings toggles (push/email/dark/language/offline) | DONE | CF-30 | PreferencesPanel |
| 27 | Privacy & Security (change password w/ validations, sessions) | DONE | F10, CF-30 | |
| 28 | Help Center (replay walkthrough, tiles, status-colour legend, FAQs, tickets panel) | DONE | CF-27, CF-28, ST-51 | `/stockist/help` |
| 29 | Create Ticket modal (category/priority) | PARTIAL | ST-51 | |
| 30 | Chats (threads w/ unread, search, composer) | PARTIAL | P1-8 ✓, ST-49/50 | |
| 31 | Invoice from Orders (multi-select + discount % or ₹ + summary) | PARTIAL | CF-16 | `/stockist/bulk-bill` multi-select; discount %/₹ UI not present |
| 32 | Credit Notes list (source return, applied-to suffix, statuses) | PARTIAL | ST-32 | |
| 33 | New Credit Note modal (manual/goodwill) | DONE | CF-39 | |
| 34 | Delivery Routes cards | DONE | ST-24, CF-18 | |
| 35 | Expiry Management (5 band tiles, filters, value-at-risk, per-item Return/Dispose) | PARTIAL | ST-43 ✓, CF-17, F7 | |
| 36 | Purchase Orders (table + Receive GRN action → stock + bill row) | DONE | CF-17 | |
| 37 | Delivery Staff mgmt (KPIs, cards w/ vehicle/area/rating) | PARTIAL | CF-18, F8 | DeliveryBoy via Staff + assign on Delivery; no vehicle/rating cards |
| 38 | Documents (upload, validity, status chips) | DONE | ST-52, F2 | Documents on `/stockist/business` |
| 39 | Reports (6 CSV tiles) | DONE | CF-26 | `/stockist/reports` (4 CF-26 tiles; catalogue export separate) |
| 40 | Bulk Price Update (scope → adjust → preview → apply) | DONE | ST-38 | |
| 41 | Batch Management table | DONE | ST-40, ST-41 | |
| 42 | Subscription (plan cards, current chip, billing history) | DONE-adapted | CF-23 | request history + admin queue; no gateway billing |
| 43 | Holiday Management (add/remove, recurring) | DONE | CF-19 | labels via date|label; checkout banner informational |
| 44 | Add Item hub (single/bulk/OCR + template download) | PARTIAL | ST-37 ✓, CF-17, CF-36 | |
| 45 | My Profile (tabs Personal/Bank/Business/Catalogue/Areas) | PARTIAL | F10, ST-52, CF-21 | ProfileSecurity + Business profile (split pages, not canvas tabs) |
| 46 | Payment Approvals page (Review/Reject/Hold/Approve, FIFO allocation, overpayment → Advance CN) | PARTIAL | ST-25, ST-26, CF-39 | pharmacy-submitted payments carry explicit allocations; FIFO prefill on recorded payments |
| 47 | Delivery Settings (Dates / Areas / Fee rules tabs) | PARTIAL | CF-18, ST-52 | Fees/holidays/slots on Business; routes on Delivery |
| 48 | Pharmacy Detail (KPIs, available credit, tabs Orders/Invoices/Reminders/Details) | DONE | ST-34, ST-29, CF-14 | `/stockist/pharmacies/:pharmacyId` |
| 49 | Order Detail: fulfilment stepper, state-dependent action bar (Accept w/ credit warn, Reject w/ reason + stock reversal, Pack, Generate Invoice, Route+Driver Dispatch, Mark Delivered), source chip, payment card, Edit Items w/ lock states, Duplicate Order | PARTIAL | ST-12–15, ST-29, CF-18, ST-56, CF-11, CF-32 | |
| 50 | Analytics Dashboard (clickable KPIs, Revenue/Orders/Top-Pharmacies tabs) | DONE | ST-46 | |
| 51 | Pharmacy Approvals queue (license/PIN, statuses) | PARTIAL | ST-33 | |
| 52 | Approval Review modal (read-only fields, document buttons, credit-limit input, Reject w/ reason / Approve & Add) | DONE | ST-33, F2 | StockistConnections Approve modal |
| 53 | Payment Review modal (fields grid + proof preview) | DONE | ST-26 | StockistPayments Review modal |
| 54 | Weekly Batch Ordering (cycle KPIs + batched orders) | DONE | CF-35 | consolidated fulfilment-planning view over real orders |
| 55 | Route Execution (distance card, Google-Maps deep-link, numbered stops, per-stop Mark Delivered) | DONE | CF-18 | |
| 56 | Returns queue (Restock / Write off / Reject w/ reason → CN) | PARTIAL | ST-30, ST-31, ST-8 | |
| 57 | Manufacturer Returns + New Mfr Return modal | DONE | CF-17 | |
| 58 | Record Payment page (mode/reference/date, FIFO hint, leftover → Advance CN) | DONE-adapted | CF-13, CF-39 | Record offline payment modal on `/stockist/payments` |
| 59 | Price History table | DONE | CF-20 | |
| 60 | Batch Expiry Calendar | PARTIAL | ST-43 | `/stockist/expiry` band list (not calendar grid) |
| 61 | Stock Transfer (from/to location, movements) | DONE | CF-33 | Transfer section on `/stockist/inventory` |
| 62 | Export Data (6 datasets, Excel/CSV) | PARTIAL | CF-26 | |
| 63 | Add Staff form (role/area/vehicle) | PARTIAL | F8, CF-18 | Invite name/email/role; no area/vehicle fields |
| 64 | Invoices list (status filters incl. Overdue) | PARTIAL | ST-27 | |
| 65 | Bill Detail (parent-order link, Edit-Items gates, Return items, Print/PDF, QR + credit/payment lines + outstanding + trust banner + Preview Verification) | PARTIAL | ST-28, F15, CF-15, ST-56 | |
| 66 | Bill Verification page (Verified/Not recognised + summary) | DONE | CF-15 | |
| 67 | Add Bill modal (pharmacy, dates, lines → paired order+invoice) | PARTIAL | CF-11 (Quick Invoice variant) | Manual order → issue invoice; no dedicated Add Bill modal |
| 68 | Users & Roles: Preview-as-role, per-row role select, designation, Active/Invited, permissions-matrix card, staff-user invite modal, no-login Delivery assignees | DONE | F8, CF-34, CF-18 | RolePreviewControls + banner; canvas roles map to PDD roles |
| 69 | Generic lists: Purchases (GRN), Suppliers, Required Stock (+Create PO), Audit Logs | DONE | CF-17, CF-37 | Procurement hub; `/stockist/activity` + `/pharmacy/activity` |
| 70 | Cross-cutting engines: order lifecycle w/ FEFO + credit warns; payments FIFO + advance CN; CN auto-apply; movement-type ledger; CSV utils; role preview; checklist state | PARTIAL | phases 3–5, CF-13, CF-39, F7, CF-26, CF-34, CF-32 | CN auto-apply → CN apply is explicit (chooser) per PDD; auto-apply offered as prompt after CN issue |

**Styling-only items:** brand accent props, card/ribbon styling, chart colors, avatar initials styling.

**Coverage statement:** all 70 inventory entries + shell mapped; zero deferred. Canvas-only concepts that conflicted with PDD (stockist-created pharmacies, silent Mark-Paid, license-as-password, open credit edits without audit) are adapted via CF-11/12/13 + docs/22.

---

## Section 3 — PlatformAdmin.dc.html (21 views + 7 overlays)

### 3.0 Global shell

| Canvas item | Now | Covered by | Adaptation |
|---|---|---|---|
| Sidebar nav (Home/Approvals w/ badge/Network/Orders/Money/Analytics/Messages/More) | PARTIAL | CF-32 (badges), AD-* | |
| Topbar global search (19 page targets + tenant hits) | DONE | F13 | GlobalSearch in AppShell |
| Profile pill dropdown (Profile/Settings/Audit/Sign out) | DONE | CF-31 | ProfileMenu |
| Mobile bottom nav (5 tabs, grouped active states) | PARTIAL | F14 | |
| Global toast, ESC modal-close priority, skeleton/empty/error CSS patterns | PARTIAL | F1, PH-38 sweep | |

### 3.1 Views

| # | Canvas view | Now | Covered by | Adaptation |
|---|---|---|---|---|
| 1 | Dashboard: Today's Work 4 KPI tiles (Approvals/Settlements/Suspensions/Counterfeit), inline Pending Verifications list w/ per-row Review, risk shortcut cards, Settlements strip | DONE | AD-19, CF-32, CF-24 | Today's Work + Quick Actions + KPI deep-links |
| 2 | More hub (Finance / Trust & safety / Content / Platform tile groups) | PARTIAL | F14 | Mobile More → `/admin/settings` shortcuts |
| 3 | Approvals queue: search, role tabs w/ counts, guided empty state, rows w/ Review + status | DONE | AD-10 | role tabs → Type/Status filters |
| 4 | Network tenant lists: role tabs, status tabs w/ counts, cards w/ document chips, Details modal (w/ per-doc View), Log-in-as | DONE | AD-20, F2, CF-25 | View-as from business detail (SuperAdmin, read-only) |
| 5 | Orders oversight: search, status tabs w/ counts, sort, pagination, Details modal w/ invoice doc link | DONE | AD-22 | detail route + invoice panel |
| 6 | Money/payments: KPI cards (Processed / Commission % / Pending), table w/ mode+status badges, Details modal w/ receipt doc | DONE | AD-22, CF-22 | `/admin/payments` + `/admin/commission` ledger KPIs |
| 7 | Reports: 5 export tiles (Revenue/GST/User Growth/Order Analytics/Settlement) w/ audit on export | DONE | CF-26 | `/admin/reports` (registrations, verification, GMV, tickets, commission) |
| 8 | Messages & Tickets: ticket rows w/ In-progress/Resolve, message inbox + thread panel | DONE | AD-23 | admin messaging = support-thread view tied to tickets |
| 9 | Notifications: mark-all, per-row dismiss, click→linked view | PARTIAL | F4/F5 | |
| 10 | Settings: toggles (Auto-approve docs / Admin Alerts / 2FA / Maintenance Mode) + Commission % + Default GST % + Save w/ audit | PARTIAL | AD-28, CF-22, CF-30 | Commission % + overrides Done on Settings/Commission; remaining toggles = CF-30 |
| 11 | Transactions register (type/date filters, ± amounts) | DONE | CF-22 | `/admin/commission` Transactions tab w/ anomaly flags |
| 12 | Platform Ledger (double-entry balances view) | DONE | CF-22 | derived commission ledger (invoice-truth; not double-entry product truth) |
| 13 | Commission Setup (rules table + add-rule form w/ validation) | DONE | CF-22 | global % + per-stockist overrides on Rates tab |
| 14 | Counterfeit Management (report cards, Investigate/Issue recall/Resolve w/ confirm + audit) | DONE | CF-24 | `/admin/counterfeit` + business report pages |
| 15 | Announcements (audience, priority, publish/unpublish toggle, audit) | DONE | AD-24 | |
| 16 | Banner Management (cards, Edit/Pause/Go live/Delete w/ confirm) | DONE | AD-25 | |
| 17 | Suspensions (table, Reactivate, Suspend Account modal entry) | DONE | AD-26 | |
| 18 | Analytics: Overview/Revenue/Network/Funnel tabs (GMV MTD, AOV, repeat rate, onboarding funnel) | PARTIAL | AD-19, CF-26 | |
| 19 | Audit Log (guided empty state, When/Action/Target/Actor/Reason) | DONE | AD-27 | |
| 20 | Admin Profile (name/phone editable, email/role readonly) | DONE | AD-12 / F10 | `/admin/profile` ProfileSecurityPage |
| 21 | (view `ledger`/`commission`/`transactions` are #11–13 above) | — | — | |

### 3.2 Overlays

| Overlay | Now | Covered by | Adaptation |
|---|---|---|---|
| A. New/Edit Banner modal (title/placement/period, validation) | DONE | AD-25 | |
| B. Suspend Account modal (tenant select, impact callout, reason required, audit note) | DONE | AD-26, F1 | |
| C. Generic admin confirm dialog | DONE | F1 | ConfirmDialog (some admin paths still use window.confirm) |
| D. Review verification modal (doc preview panel + selector, 3-item checklist, decision reason required, Approve/Needs changes/Reject; approve → live directory + walkthrough reset) | PARTIAL | AD-10, F2, CF-28 | |
| E. Detail modal (tenant/order/payment + documents drill-down) | DONE | AD-20, AD-22 | route-based detail pages |
| F. Impersonation modal (reason required, audited, read-only) | DONE | CF-25 | enter from AdminBusinessDetail |
| Global toast | DONE | — | |

**Styling-only items:** accent props, gradient banner placeholders, avatar styling.

**Coverage statement:** all 21 views + 7 overlays + shell mapped; zero deferred. Commission/ledger/transactions are delivered as derived read-only monitoring (docs/22 CF-22) per PDD principle "documents are the only financial truth".

---

---

## Section 4 — DigiSwasthya.dc.html + index.html (launcher / auth / registration / shared shell)

`index.html` is a pure redirect page — no features (styling-only).

| Canvas item | Now | Covered by | Adaptation |
|---|---|---|---|
| Login: email+password, forgot link, create-account link, error messages incl. "no account — create one?" and status routing (suspended/invite/pending/portal) | DONE | P1-3 ✓, AD-7 ✓, AD-13 ✓ | fields default blank; quick-login panel kept; TTL + lockout |
| Forgot password 4-step wizard (request by email OR phone w/ masked-email info → 6-digit OTP w/ demo chip → new+confirm password → done) | PARTIAL | AD-7 | single-page flow upgraded to stepped flow with same validations |
| Staff invite acceptance (role/business context copy, min-6 + confirm, auto-login, refresh-safe invite state) | PARTIAL | AD-16 | |
| Pending verification workspace: lock notice, 3-step tracker w/ status labels (incl. needs_changes/rejected), submitted-documents panel, changes-requested panel w/ admin reason, re-upload sub-panel (file types/5MB, resubmit → under_review) | DONE | AD-8 ✓, AD-9 ✓ | |
| Suspended screen (reason banner, support contact info, back to sign-in) | DONE | AD-11 ✓, P1-12 ✓ | + reactivation request + read-only history |
| Registration type picker (2 option cards w/ descriptions) | DONE | — | descriptions = copy polish |
| Registration wizard — step indicator w/ done/current states; stockist 5 steps / pharmacy 4 steps; abandon/cancel/back confirms when dirty | DONE | AD-7, F1 | docs step lands in AD-8 |
| Wizard Step: business/pharmacy details (business types, pharmacy types, PAN w/ regex) | DONE | AD-7 | |
| Wizard Step: documents — per-doc upload blocks (type/size validation, uploaded-file cards, remove), per-doc license-number inputs (DL/GSTIN/wholesale/FSSAI/pharmacy cert), required-doc validation | DONE | AD-8, F2 | |
| Wizard Step: contact & address — owner+designation (pharmacy), phone regex + duplicate-phone check, alternate/WhatsApp phone, inline phone-OTP widget (send/resend/verify, demo OTP), email uniqueness, password, address, State select (36 states) + city datalist + PIN, stockist serviceable-PIN chips | DONE | AD-7 ✓, AD-8 ✓ | |
| Wizard Step: bank (stockist required / pharmacy optional) — bank auto-detect from IFSC prefix, account+confirm match, UPI, holder name | DONE | AD-7 | |
| Wizard: review/complete step — summary rows, 24–48h note, Terms + Privacy consent checkboxes + legal modal, "Open verification workspace" finish | DONE | AD-7 | finish → /auth/pending |
| Legal modal (T&C / Privacy static text) | DONE | AD-7 | |
| App-shell dispatch: role → portal routing, per-panel last-view persistence, deep-link guards | DONE | — | React Router + guards |
| Impersonation session plumbing (readOnly flag, reason, brand swap, exit-to-admin, rename tenant) | DONE | CF-25, PH-28/ST-52 (display name) | |
| Sign-out confirm dialog (used from all panels) | DONE | CF-31, F1 | ProfileMenu |
| Onboarding walkthrough overlay: 4 role-specific slides, progress dots, skip; Phase 2 "complete profile" form; seen-flag per role+email; replay hook | DONE | CF-28, F10 | first-login + replay from Help/topbar |
| Global confirm dialog primitive | DONE | F1 | ConfirmDialog component |
| Seed: 3 verified users (admin/vikram/neha) + 1 connection + 1 order + 6 invoices ("not demo shortcuts", SEED_VER mechanism, retired-account logout) | DONE | P1-1, P1-2 | **user directive overrides canvas seed**: v3 seeds ONLY the 3 users + zero business data; SEED_VERSION bump = the wipe mechanism |
| DigiDS status-label/tone contract (order labels, badge tones, ₹/date formats) | DONE | — | StatusBadge/formatINR equivalents |
| DigiNav shared bus (orders/payments/connections/returns/CNs/invoices/tickets/notifications/accounts, FIFO allocation, CN application, event→notification matrix) | DONE | F11, CF-39 | Dexie + services are the bus; FIFO/advance-CN per CF-13/CF-39 |
| Validation library (email/phone/PAN/IFSC/PIN/GSTIN/license + normalization + phone-uniqueness) | DONE | AD-7 | |
| Activation checklists per role (connect/documents/inviteStaff/firstOrder/pay/receive) | DONE | CF-32 | Pharmacy setup checklist on home |
| Impersonation tenant profiles (static fake tenants) | — | CF-25 | impersonation targets real businesses only (no fabricated tenants) |

**Styling-only items:** launcher branding/tagline layout, preview-canvas sizing, accent props, icon illustration choices, ds-* CSS class system (React design system is the equivalent).

**Coverage statement:** all launcher/auth/wizard/onboarding/shell/script features mapped; zero deferred.

---

## Completeness rule

When any ledger item in PLAN/13 closes, update the matching rows here (Now → DONE). A canvas behaviour with no row in this file is a defect of this file — add the row, map it, and if no ledger item covers it, add one to PLAN/13. The four canvas inventory extracts this matrix was built from are archived in the audit record of 2026-07-31.
