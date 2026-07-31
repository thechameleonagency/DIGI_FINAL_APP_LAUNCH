# UI / UX & Design System Requirements

Sources: design canvases CSS tokens, `docs/18` usability/accessibility/mobile, `docs/15` dashboard principles, Glossary language rules.

---

## 1. Brand & Visual Direction

Port from existing canvases / `index.html`:

| Token | Value |
|---|---|
| `--ds-font` | Lexend (500/700), fallback ui-sans-serif |
| `--accent` / brand | `#4A7399` (hover `#3D6180`) |
| Page background | `#fafafa` |
| Surface | `#ffffff` |
| Subtle | `#f1f5f9` |
| Text | `#0f172a` |
| Muted | `#64748b` / `#94a3b8` |
| Border | `#e2e8f0` |
| Success | `#16a34a` |
| Warning | `#d97706` |
| Danger | `#dc2626` |
| Radius | controls ~10px, cards ~12–18px |
| Sidebar width | 240px |
| Control height | ~40px; button ~38px |

**Brand test:** Auth and home first viewport must show **DigiSwasthya** as hero-level signal (product name), not only nav text — matches canvas auth headers.

Avoid generic purple/cream AI aesthetics; preserve established blue-slate pharmaceutical ops look from canvases.

---

## 2. Layout Patterns

- **Desktop:** Left sidebar + top bar (search, notifications, profile).  
- **Mobile:** Bottom nav (Pharmacy/Stockist primary); stacked pages; full-width forms.  
- **Operational queues first** on homes — not decorative metric walls (`docs/18` §8, `docs/15`).  
- **One job per section** on dashboards.  
- Cards OK for KPI/queue interaction containers (drill-down); avoid card spam in marketing sense.  
- Tables for dense finance/ops; list rows on mobile.

---

## 3. Component Inventory (Design System)

### Foundations
`Button`, `IconButton`, `Input`, `Select`, `Textarea`, `Checkbox`, `Radio`, `Switch`, `DateField`, `FileUpload`, `FormField` (label/error/hint)

### Feedback
`Toast`, `Banner`, `Alert`, `EmptyState`, `Skeleton`, `Spinner`, `PermissionDenied`, `ConfirmDialog`, `SuccessSummary` (canvas pattern with next link)

### Data display
`StatusBadge` (text+color), `Money` (INR en-IN), `DataTable`, `FilterBar`, `SearchInput`, `Pagination`, `Tabs`, `KPICard`, `ChartCard`, `Timeline`, `DescriptionList`

### Navigation
`AppShell`, `SidebarNav`, `BottomNav`, `Breadcrumbs`, `ProfileMenu`, `NotificationBell`

### Domain composites
`OrderStatusTimeline`, `AllocationBatchPicker`, `CartLineEditor`, `PaymentAllocationEditor`, `InvoiceDocumentView`, `ReturnLineEditor`, `ConnectionRequestCard`, `VerificationDocList`, `DeliveryBoyBoard`, `Checklist`, `ExpiryBandChip`, `ProofOfDeliveryCapture`

### Overlays
`Drawer`, `Modal`, `ActionSheet` (mobile)

---

## 4. UX Rules Extracted from PDD

1. Errors explain **business impact** (“Payment was not approved; outstanding unchanged.”) — `docs/17`.  
2. Partial success lists succeeded + failed — never lone “Success”.  
3. Official actions only via workflow buttons — never via chat.  
4. Status never color-only — `docs/18` §9.  
5. Empty states guide next action — `docs/15` §17.  
6. Critical notices (verification/suspension/security/invoice/credit) cannot be fully muted — `docs/13`.  
7. Use Glossary terms exactly — `docs/21` Language Rules (Order≠Invoice, etc.).  
8. Mobile-complete: Delivery Boy, GRN, status checks, notification triage — `docs/18` §10.  
9. Desktop-primary: catalogue import, bulk pricing, admin config.  
10. Idempotent buttons: disable on submit; show existing record on duplicate.

---

## 5. Motion

Ship 2–3 intentional motions (subtle, ops-friendly):

1. Sidebar active indicator / page enter fade (~150ms)  
2. Toast slide-in  
3. Checklist item complete check animation  

Avoid noisy glow/parallax.

---

## 6. Content Tone

- Professional B2B pharma ops  
- Prefer “Outstanding”, “Issued”, “Approved” over slang  
- Reasons required on Reject/Hold/Suspend/Cancel/Void  

---

## 7. Accessibility Baseline

- Contrast readable on `#fafafa` / white  
- Focus rings on controls  
- Labels on all inputs  
- Icon buttons have `aria-label`  
- Touch targets ≥ 36–44px (canvas icon btn 36px — bump critical actions to 44 on mobile)
