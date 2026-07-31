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
