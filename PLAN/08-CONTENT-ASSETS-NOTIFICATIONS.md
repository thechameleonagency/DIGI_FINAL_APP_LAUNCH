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
