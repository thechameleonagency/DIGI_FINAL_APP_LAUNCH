# Routing, State Management & Component Inventory

---

## 1. Routing Structure

```
/auth/*
/pharmacy
  /buy
    /discover
    /stockists/:id
    /catalogue/:stockistId
    /product/:productId
    /compare
    /cart
    /checkout
    /wishlist
  /orders
    /:orderNo
    /:orderNo/grn
  /returns
    /new
    /:returnNo
  /inventory
    /batches/:batchId
    /movements
    /expiry
  /payments
    /invoices/:invoiceNo
    /:paymentNo
    /new
  /connections
  /analytics/:tab?
  /staff
  /business
  /business/verification
  /notifications
  /messages
  /messages/:threadId
  /support
  /support/:ticketNo
  /settings/*
  /reports
  /profile
  /more

/stockist
  /pharmacies
    /requests
    /:pharmacyId
  /orders
    /:orderNo
    /:orderNo/allocate
    /:orderNo/pack
    /:orderNo/invoice
  /catalogue
    /products/new
    /products/:productId
    /import
  /inventory/*
  /delivery
    /board
    /routes
    /:deliveryNo
  /payments/*
  /returns/*
  /credit-notes/*
  /analytics/:tab?
  /staff
  /business
  /notifications
  /messages/*
  /support/*
  /audit
  /reports
  /settings/*
  /more

/admin
  /verifications/:id?
  /network/:type?/:businessId?
  /orders/:orderNo?
  /payments/:paymentNo?
  /support/:ticketNo?
  /announcements
  /banners
  /suspensions
  /analytics
  /audit
  /settings
  /reports
  /profile
  /more
```

Route guards: `RequireAuth`, `RequireBusinessType`, `RequirePermission(verb, resource)`, `RequireVerifiedForTrade` (soft: allow read-only history when suspended).

---

## 2. State Management Plan

| Concern | Tool | Notes |
|---|---|---|
| Session (user, business, role) | Zustand `useSession` | Hydrate from sessionStorage |
| UI ephemeral (drawers, tabs, toasts) | Zustand `useUi` | |
| Cart / wishlist | Zustand + IDB persist | Not financial truth |
| Server-state equivalent (entities) | Repository hooks `useOrder(id)` reading Dexie | Live query via dexie-react-hooks |
| Domain mutations | Service commands returning Result | No direct table writes from UI |
| Notifications unread count | Derived live query | |
| Analytics | `useAnalytics(scope, period)` recompute or cache | Stale flag |

### Command pattern example

```ts
await orderService.placeOrder({ cartId, addressId, notes, idempotencyKey })
// → validates permissions, connection, products → writes order → emits OrderPlaced → notifications
```

### Selectors

Always derive outstanding/KPI from calculation module, not from ad-hoc component math.

---

## 3. Feature Module Component Inventory

### Auth
`LoginForm`, `RegisterWizard`, `ForgotPasswordFlow`, `InviteAcceptForm`, `VerificationPendingView`, `SuspendedView`

### Shared
`EntitySearchPage`, `ExportButton`, `AuditTimeline`, `MessageThread`, `NotificationList`, `SupportTicketForm`, `FileProofUpload`, `AddressForm`, `StaffInviteForm`, `RolePermissionEditor`

### Pharmacy
`PharmacyHome`, `StockistDiscovery`, `CatalogueBrowser`, `ProductDetail`, `ProductCompare`, `CartView`, `CheckoutForm`, `OrderList`, `OrderDetail`, `GrnForm`, `PaymentCreate`, `PaymentList`, `ReturnCreate`, `InventoryManager`, `PharmacyAnalytics`, `WishlistPage`

### Stockist
`StockistHome`, `PharmacyRelationshipList`, `OrderInbox`, `AcceptRejectPanel`, `BatchAllocator`, `PackConfirm`, `InvoiceIssueWizard`, `DeliveryManager`, `DeliveryBoyBoard`, `PaymentApprovalQueue`, `ReturnReviewPanel`, `CreditNoteIssue`, `CatalogueManager`, `CatalogueImport`, `StockistAnalytics`

### Admin
`AdminHome`, `VerificationQueue`, `VerificationReview`, `NetworkDirectory`, `PlatformOrderBrowser`, `PlatformPaymentBrowser`, `TicketConsole`, `AnnouncementEditor`, `BannerEditor`, `AuditLogBrowser`, `PlatformSettingsForm`, `SuspendBusinessModal`

---

## 4. Shared Domain Package Boundaries

```
domain/entities/*          # types matching docs/8
domain/machines/*          # docs/10
domain/calc/*              # docs/11
domain/permissions/*       # docs/12
domain/errors/*            # docs/17 codes
domain/notifications/catalog.ts  # N-001…
```

No React imports inside `domain/`.

---

## 5. Cross-Cutting Hooks

- `usePermission(action, resource, entity?)`  
- `useBusinessGates()` → verified/suspended/connection helpers  
- `useIdempotencyKey(actionName)`  
- `usePolicyClock()` → triggers SLA jobs  
- `useMoneyFormatter()`  
- `useStatusLabel(entityType, status)` — glossary-aligned labels (map canvas synonyms like `confirmed`→Accepted)

---

## 6. Canvas-Derived Route & Component Additions (docs/22) — added 2026-07-31

### Route additions (extend §1 trees; same guard rules)

```
/pharmacy: smart-order, smart-order/history, quick-order, compare, market, market/:stockistId,
           product/:productId, sales, sales/:saleNo, areas, routes, checkout, invoices, invoices/:invoiceNo,
           ledger/:stockistId, stockists/:id, inventory/expiry, inventory/movements, returns/new,
           otc, upgrade, help, profile, reports
/stockist: orders/batch-view, pharmacies/:id, invoices/:invoiceNo, record-payment, bulk-bill, create-bill,
           suppliers, purchase-orders, purchase-orders/:poNo, purchase-bills, required-stock, supplier-returns,
           catalogue/bulk-price, catalogue/price-history, catalogue/share, inventory/movements, inventory/transfer,
           delivery/routes, delivery/routes/:routeId, delivery/settings, holidays, subscription, activity,
           help, profile, reports
/admin:    network/:id, orders/:orderNo, payments/:paymentNo, returns, transactions, commission, plans,
           counterfeit, flags, help, profile, reports
public:    /verify-bill, /catalogue-share/:stockistId
```

### New shared components (existing design system only)

`ConfirmDialog` (F1) · `FileUpload`/`FileLink` (F2) · `NotificationsPage` (F5) · `GlobalSearch` (F13) · `InvoiceDocument` w/ QR (F15/CF-15) · `StaffManager` (F8) · `ProfileSecurityPage` (F10) · `AnnouncementBanner(placement)` · `TicketPanel` · `EmptyState` sweep · `SuccessSummary` (CF-32) · `SetupChecklist` (CF-32) · `KpiLink`/`KpiDetail` (CF-32) · `OnboardingWalkthrough` (CF-28) · `RolePreviewBanner` (CF-34) · `QrBlock` (CF-15/21) · `TextOrderParser` UI (CF-02).

### New services

`fileService`, `notificationService`, `inventoryService`, `staffService`, `salesService` (CF-05/06), `procurementService` (CF-17), `routeService` (CF-18), `partnerService` (CF-12), `commissionService` (derived reads, CF-22), `planService` (CF-23), `counterfeitService` (CF-24), `impersonationService` (CF-25), `reportService` (CF-26), `referenceData` (CF-36 static). All follow the Result/assertCan/machine/audit/notify pattern.

### State notes

Impersonation = session flag `{impersonating, targetBusinessId, reason, readOnly: true}` honored by every service (mutations blocked). Role preview = UI-only session flag (CF-34). Counters hydrate at bootstrap (PLAN/04 §5).
