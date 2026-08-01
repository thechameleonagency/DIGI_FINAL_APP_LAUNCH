# Content, Copy, Notifications & Assets

---

## 1. Product Language

Use `docs/21` Product Glossary exclusively. Critical distinctions must appear in UI microcopy and training FAQs:

- Order vs Invoice  
- Payment vs Settlement  
- Return vs Credit Note  
- Notification vs Message  
- Available vs On Hand  
- Disconnect vs Suspend  
- Draft vs Issued  

Document numbers labeled: Order Number, Invoice Number, Payment Number/Reference, Delivery Number, Return Number, Credit Note Number, Ticket Number.

---

## 2. Notification Catalogue (Implement All)

Full specs in `docs/13`. Every code must have template title/body with placeholders:

| Codes | Domain |
|---|---|
| N-001…N-009 | Verification & staff |
| N-010…N-015 | Connections |
| N-016…N-026 | Orders & delivery |
| N-027…N-030 | Invoices |
| N-031…N-035 | Payments |
| N-036…N-041 | Returns & credits |
| N-042…N-045 | Inventory alerts |
| N-046…N-050 | Messages, support, announcements |
| N-051…N-060 | Security, SLA, reactivation, credit expiry, export, partial fulfilment |

Store templates in `content/notifications.json`.

---

## 3. FAQ / Help Copy (Minimum)

Seed from canvas Help FAQs + PDD:

1. How do I place an order with a stockist?  
2. How do I connect with a new stockist?  
3. How are payments tracked/approved?  
4. What happens after I submit verification?  
5. How do returns and credit notes work?  
6. Why can’t I see prices? (no Active connection)  
7. Why was my account suspended?  
8. Who can approve payments in my business?  

---

## 4. Empty-State Copy Bank

| Context | CTA |
|---|---|
| No connections | Find stockists |
| No orders | Browse catalogue |
| No catalogue products | Add product |
| No pending payments | You’re all caught up |
| No verification queue | No pending verifications |
| Search no results | Adjust filters |
| Delivery boy no assignments | No deliveries assigned |

---

## 5. Asset Requirements

| Asset | Spec |
|---|---|
| App favicon / logo mark | DigiSwasthya wordmark + mark; SVG |
| Auth illustration (optional) | Ops/pharma abstract; not stock clutter |
| Default business avatar | Initials fallback |
| File type icons | PDF/image for docs & payment proof |
| Banner image slots | Admin-managed gradient/CSS ok for v1 |
| Seed product images | Optional placeholders |
| PWA icons (optional) | If Vite PWA added later — not required by PDD |

Documents/uploads are user-provided blobs — no CDN.

---

## 6. Announcements & Banners Content Model

- Title, body, audience (Pharmacy/Stockist/All), priority, schedule, expiry  
- Banner placements: Pharmacy Home, Stockist Home, Pharmacy Buy, All Dashboards  
- Expired must stop showing (E-T18)

---

## 7. Localization

v1: **English + INR + en-IN number/date formats**.  
`preferredLanguage` field stored but single UI language (`docs/18` §12). Timezone: single `Asia/Kolkata` business timezone in settings.

---

## 8. Canvas-Derived Additions (docs/22) — added 2026-07-31

### 8.1 New notification codes N-301…N-316

Templates also live in `content/notifications.json`. Full triggers/recipients table in `docs/22` (Part 21): N-301/302 OTC application submitted/decided · N-303 order recorded on your behalf · N-304 invited pharmacy registered · N-305 payment recorded on your account · N-307 payment reminder · N-308 PO fully received · N-309/310 upgrade requested/decided · N-311/313/314 counterfeit filed / batch recall notice / report outcome · N-315 workspace viewed by platform support · N-316 delivery scheduled/rescheduled. (N-306/312 reserved.)

### 8.2 App-code ↔ docs/13 mapping rule (AD-33)

The app's internal N-code numbering diverges from `docs/13` in places (e.g. app N-002 = "verification submitted to admin"). **Rule:** all routing/deep-links key off `entityType`/`entityId`, never N-codes; audits map by meaning. A `content/notification-code-map.md` table must accompany the catalog when built.

### 8.3 Empty-state copy bank — extension (zero-state seed makes these mandatory)

| Context | CTA |
|---|---|
| Pharmacy returns | No returns yet — raise one from a delivered order |
| Pharmacy inventory | Receive an order (GRN) or add stock to start tracking |
| Pharmacy buy: connected stockist w/ empty catalogue | This stockist hasn't published products yet |
| Pharmacy payments history / credits | Payments and credit notes appear after your first settlement |
| Pharmacy support / notifications / connections | Guiding CTA per module (create ticket / actions appear here / find stockists) |
| POS sales | Record your first walk-in sale with New Sale |
| Smart/Quick order results | No suggestions yet — order history builds them |
| Stockist pharmacies / inventory / invoices / payments / credit notes / staff / support / notifications | Guiding CTA per module (share profile / stock in / issue after fulfilment / etc.) |
| Stockist suppliers / POs / routes / holidays | Add your first supplier / raise a PO / create a route / add a holiday |
| Admin support / audit / announcements / banners / counterfeit / plans / notifications | "No tickets yet" / "Actions appear here" / create-first CTAs |
| Marketplace no results | Try another name, brand, or stockist |
| Bill verification not found | No matching invoice on this installation |

### 8.4 New static content

Help Center FAQ + per-journey guides (CF-27), onboarding slides per role (CF-28), legal texts (T&C/Privacy for registration consent), medicine reference dataset (CF-36) — all under `src/content`, versioned with the app.
