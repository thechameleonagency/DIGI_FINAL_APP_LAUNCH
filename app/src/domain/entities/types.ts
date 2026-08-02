/** DigiSwasthya domain entity types (PDD Part 7 / docs/8) */

export type BusinessType = 'Pharmacy' | 'Stockist' | 'Platform';
export type AccountStatus = 'Active' | 'Suspended' | 'Deactivated' | 'PendingActivation';
export type VerificationStatus =
  | 'NotStarted'
  | 'Submitted'
  | 'UnderReview'
  | 'DocumentsRequested'
  | 'Approved'
  | 'Rejected';

export type OperationalRole =
  | 'Pharmacist'
  | 'Stockist'
  | 'DeliveryStaff'
  | 'SupportManager'
  | 'SuperAdmin';

export type UserStatus = 'Active' | 'Invited' | 'Suspended' | 'Removed';

export type ConnectionStatus =
  | 'Requested'
  | 'Active'
  | 'Rejected'
  | 'Disconnected'
  | 'Blocked'
  | 'Cancelled';

export type ProductStatus = 'Active' | 'Inactive' | 'Discontinued';
export type CatalogueStatus = 'Active' | 'Maintenance' | 'Inactive';
export type BatchStatus = 'Available' | 'Quarantined' | 'Recalled' | 'Expired' | 'Depleted';

export type OrderStatus =
  | 'Draft'
  | 'Pending'
  | 'Accepted'
  | 'PartiallyAccepted'
  | 'Rejected'
  | 'Cancelled'
  | 'Allocated'
  | 'Packed'
  | 'Dispatched'
  | 'PartiallyDelivered'
  | 'Delivered'
  | 'Closed';

export type DeliveryStatus =
  | 'Created'
  | 'Assigned'
  | 'OutForDelivery'
  | 'Delivered'
  | 'PartiallyDelivered'
  | 'Failed'
  | 'Cancelled';

export type InvoiceStatus =
  | 'Draft'
  | 'Issued'
  | 'PartiallyPaid'
  | 'Paid'
  | 'Overdue'
  | 'Void';

export type PaymentStatus =
  | 'Draft'
  | 'Submitted'
  | 'UnderReview'
  | 'Approved'
  | 'Rejected'
  | 'OnHold'
  | 'Cancelled';

export type ReturnStatus =
  | 'Draft'
  | 'Submitted'
  | 'UnderReview'
  | 'Approved'
  | 'PartiallyApproved'
  | 'Rejected'
  | 'GoodsReceived'
  | 'Closed'
  | 'Cancelled';

export type CreditNoteStatus = 'Issued' | 'PartiallyApplied' | 'FullyApplied' | 'Void';
export type TicketStatus = 'Open' | 'InProgress' | 'WaitingOnUser' | 'Resolved' | 'Closed' | 'Reopened';
export type NotificationStatus = 'Unread' | 'Read' | 'Archived';

export interface Address {
  id: string;
  label: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault?: boolean;
}

export interface StatusHistoryEntry {
  from: string;
  to: string;
  at: string;
  actorId: string;
  reason?: string;
}

export interface Business {
  id: string;
  type: BusinessType;
  name: string;
  legalName?: string;
  gstNumber?: string;
  drugLicenseNumber?: string;
  panNumber?: string;
  pharmacyType?: string;
  phone: string;
  /** Optional alternate / WhatsApp contact collected at registration */
  alternatePhone?: string;
  email: string;
  city: string;
  state: string;
  pincode: string;
  address: string;
  accountStatus: AccountStatus;
  verificationStatus: VerificationStatus;
  ownerUserId: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankName?: string;
  upiId?: string;
  accountHolderName?: string;
  servicePins?: string[];
  creditDaysDefault?: number;
  holidays?: string[];
  preferences?: {
    deliverySlots?: string[];
    instructions?: string;
    defaultReceiver?: string;
    /** CF-18: optional delivery fee applied at invoice issue (immutable thereafter) */
    deliveryFeeFlat?: number;
    deliveryFeeFreeAbove?: number;
    /** CF-23 Premium convenience — saved analytics period presets */
    reportPresets?: { id: string; name: string; periodDays: number }[];
  };
  plan?: 'Free' | 'Premium';
  locations?: { id: string; name: string; address?: string }[];
  deliveryAddresses?: Address[];
  createdAt: string;
  updatedAt: string;
  suspendedAt?: string;
  /** Business-visible reason shown on Suspended page / notifications */
  suspendReason?: string;
  /** Admin-only note — never shown to the business */
  internalNotes?: string;
}

export interface User {
  id: string;
  businessId: string;
  name: string;
  email: string;
  phone: string;
  /** Session-only CF-25 flag — never persisted to Dexie */
  impersonationReadOnly?: boolean;
  role: OperationalRole;
  status: UserStatus;
  passwordSalt: string;
  passwordHash: string;
  inviteToken?: string;
  inviteExpiresAt?: string;
  permissionOverrides?: Record<string, boolean>;
  notificationPreferences?: { mutedCategories?: string[] };
  /** CF-30 UI preferences (persist with user) */
  uiPreferences?: {
    theme?: 'light' | 'dark';
    language?: 'en';
    showLocalFirstHint?: boolean;
  };
  onboardingSeenAt?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export type VerificationDocKind = 'DrugLicense' | 'GstinCert' | 'WholesaleLicense' | 'Fssai' | 'PharmacyCert';

export interface VerificationDocument {
  kind: VerificationDocKind;
  fileId: string;
  licenseNumber?: string;
  label: string;
}

export interface Verification {
  id: string;
  businessId: string;
  status: VerificationStatus;
  submittedAt?: string;
  reviewedAt?: string;
  reviewerId?: string;
  rejectReason?: string;
  requestDocsNote?: string;
  internalNotes?: string;
  documentIds: string[];
  documents?: VerificationDocument[];
  decisionHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Connection {
  id: string;
  pharmacyId: string;
  stockistId: string;
  status: ConnectionStatus;
  requestedAt: string;
  respondedAt?: string;
  creditDays?: number;
  creditLimit?: number;
  customerPricingEnabled?: boolean;
  note?: string;
  rejectReason?: string;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  stockistId: string;
  catalogueId: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  composition?: string;
  packSize: string;
  hsn?: string;
  mrp: number;
  ptr: number;
  pts?: number;
  gstPercent: number;
  moq: number;
  maxQty?: number;
  reorderLevel?: number;
  purchaseRate?: number;
  manufacturer?: string;
  genericName?: string;
  /** Required for trade pricing — Generic % vs Ethical flat per line. */
  pricingClass: 'Generic' | 'Ethical';
  rxRequired?: boolean;
  narcotic?: boolean;
  status: ProductStatus;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Catalogue {
  id: string;
  stockistId: string;
  status: CatalogueStatus;
  updatedAt: string;
}

export interface Batch {
  id: string;
  productId: string;
  stockistId: string;
  batchNumber: string;
  expiryDate: string;
  mfgDate?: string;
  onHand: number;
  reserved: number;
  cost?: number;
  status: BatchStatus;
  location?: string;
  createdAt: string;
  updatedAt: string;
}

export type MovementType =
  | 'StockIn'
  | 'Reservation'
  | 'Release'
  | 'DispatchConsume'
  | 'ReturnIn'
  | 'Adjustment'
  | 'Expiry'
  | 'Destroy'
  | 'Quarantine'
  | 'GRNIn'
  | 'Transfer'
  | 'TransferOut'
  | 'TransferIn'
  | 'SaleOut'
  | 'SaleVoidIn'
  | 'SaleReturnIn';

export interface InventoryMovement {
  id: string;
  businessId: string;
  productId: string;
  batchId?: string;
  type: MovementType;
  qty: number;
  reason: string;
  sourceDocType?: string;
  sourceDocId?: string;
  actorId: string;
  prevQty: number;
  newQty: number;
  at: string;
}

export interface OrderLine {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  packSize: string;
  qty: number;
  acceptedQty?: number;
  allocatedQty?: number;
  packedQty?: number;
  deliveredQty?: number;
  receivedQty?: number;
  /** Inclusive unit price shown to pharmacy (PTR + commission baked in). */
  unitPrice: number;
  /** Stockist PTR snapshot at order time. */
  basePtr?: number;
  /** Total commission for this line (not shown to pharmacy). */
  commissionAmount?: number;
  pricingClass?: 'Generic' | 'Ethical';
  commissionMode?: 'PlatformGeneric' | 'PlatformEthical' | 'OfflineManaged';
  mrp: number;
  gstPercent: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  discrepancyReason?: string;
  batchAllocations?: { batchId: string; batchNumber: string; qty: number; expiryDate: string }[];
}

export interface Order {
  id: string;
  orderNo: string;
  pharmacyId: string;
  stockistId: string;
  connectionId: string;
  status: OrderStatus;
  lines: OrderLine[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  deliveryAddress: Address;
  preferredDate?: string;
  notes?: string;
  source?: 'Platform' | 'Manual' | 'QuickInvoice';
  createdByBusinessId?: string;
  /** When order is for a stockist-managed offline pharmacy. */
  managedPharmacyId?: string;
  preferredDeliveryDate?: string;
  idempotencyKey: string;
  statusHistory: StatusHistoryEntry[];
  invoiceId?: string;
  deliveryId?: string;
  grnRecordedAt?: string;
  placedBy: string;
  placedAt: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface DeliveryLine {
  productId: string;
  productName: string;
  qty: number;
  deliveredQty: number;
  batchNumber?: string;
  expiryDate?: string;
  /** Pharmacy GRN for this delivery leg. */
  receivedQty?: number;
  discrepancyReason?: string;
}

export interface Delivery {
  id: string;
  deliveryNo: string;
  orderId: string;
  invoiceId?: string;
  stockistId: string;
  pharmacyId: string;
  status: DeliveryStatus;
  assignedTo?: string;
  routeId?: string;
  scheduledDate?: string;
  lines: DeliveryLine[];
  podFileId?: string;
  receivedBy?: string;
  failReason?: string;
  returnedToStockistAt?: string;
  /** When pharmacy recorded GRN for this delivery leg. */
  grnRecordedAt?: string;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
}

export interface InvoiceLine {
  productId: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: number;
  gstPercent: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  batchNumber?: string;
  expiryDate?: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  orderId: string;
  stockistId: string;
  pharmacyId: string;
  status: InvoiceStatus;
  lines: InvoiceLine[];
  subtotal: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
  outstanding: number;
  paidAmount: number;
  creditApplied: number;
  issuedAt?: string;
  dueDate?: string;
  voidReason?: string;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PaymentAllocation {
  invoiceId: string;
  invoiceNo: string;
  amount: number;
}

export interface Payment {
  id: string;
  paymentNo: string;
  pharmacyId: string;
  stockistId: string;
  status: PaymentStatus;
  amount: number;
  method: 'UPI' | 'NEFT' | 'RTGS' | 'Cheque' | 'Cash' | 'Other';
  reference?: string;
  proofFileId?: string;
  allocations: PaymentAllocation[];
  notes?: string;
  rejectReason?: string;
  holdReason?: string;
  submittedBy: string;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  recordedBy?: 'Pharmacy' | 'Stockist';
  idempotencyKey: string;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ReturnLine {
  productId: string;
  productName: string;
  qty: number;
  approvedQty?: number;
  unitPrice: number;
  /** GST snapshot from the order line at return submit time. */
  gstPercent: number;
  reason: string;
  batchNumber?: string;
  deliveryId?: string;
  invoiceId?: string;
}

export interface ReturnRequest {
  id: string;
  returnNo: string;
  pharmacyId: string;
  stockistId: string;
  orderId: string;
  status: ReturnStatus;
  lines: ReturnLine[];
  evidenceFileIds: string[];
  rejectReason?: string;
  disposition?: string;
  creditNoteId?: string;
  submittedBy: string;
  idempotencyKey?: string;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CreditApplication {
  invoiceId: string;
  invoiceNo: string;
  amount: number;
  at: string;
  actorId: string;
}

export interface CreditNote {
  id: string;
  creditNoteNo: string;
  returnId?: string;
  stockistId: string;
  pharmacyId: string;
  status: CreditNoteStatus;
  amount: number;
  remaining: number;
  applications: CreditApplication[];
  source?: 'Return' | 'Goodwill' | 'Advance';
  reason?: string;
  paymentId?: string;
  issuedAt: string;
  /** When set and auto-expire is on, remaining credit voids after this timestamp. */
  expiresAt?: string;
  issuedBy: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  businessId: string;
  code: string;
  title: string;
  body: string;
  status: NotificationStatus;
  entityType?: string;
  entityId?: string;
  /** Human-facing number for deep links (orderNo / invoiceNo / paymentNo / …). */
  entityNo?: string;
  createdAt: string;
  readAt?: string;
}

export interface MessageThread {
  id: string;
  participantBusinessIds: string[];
  participantUserIds: string[];
  relatedEntityType?: string;
  relatedEntityId?: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readBy: string[];
}

export interface SupportTicket {
  id: string;
  ticketNo: string;
  businessId: string;
  createdBy: string;
  assigneeId?: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: 'Low' | 'Medium' | 'High';
  relatedEntityType?: string;
  relatedEntityId?: string;
  updates: { at: string; actorId: string; body: string; status?: TicketStatus }[];
  createdAt: string;
  updatedAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  targetRoles: string[];
  placements: string[];
  priority?: 'Low' | 'Medium' | 'High';
  startsAt: string;
  endsAt?: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

export interface Banner {
  id: string;
  text: string;
  tone: 'info' | 'warning' | 'success' | 'danger';
  placements: string[];
  startsAt: string;
  endsAt?: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  businessId?: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  at: string;
}

export interface PlatformSettings {
  id: 'platform';
  returnWindowDays: number;
  inviteTtlDays: number;
  verificationSlaHours: number;
  orderSlaHours: number;
  paymentSlaHours: number;
  paymentProofMandatory: boolean;
  billAheadAllowed: boolean;
  roundingMode: 'nearest' | 'up' | 'down';
  expiryNearDays: number;
  expiryCriticalDays: number;
  creditNoteAutoExpire: boolean;
  creditNoteExpiryDays?: number;
  /** Platform Generic rate % (default 0.5). */
  genericCommissionPercent?: number;
  /** Ethical flat ₹ per product line (default 1). */
  ethicalCommissionFlatPerProduct?: number;
  /** Offline/managed pharmacy flat ₹ per line (default 1). */
  offlineManagedFlatPerLine?: number;
  /** Flag payments larger than this × pair average. */
  largePaymentMultiple?: number;
  /** CF-23 admin-editable Premium plan copy */
  premiumPlan?: {
    priceText: string;
    benefits: string[];
    upiId: string;
  };
  defaultGstPercent?: number;
  maintenanceMode?: boolean;
  lastPolicyRunAt?: string;
}

export interface StoredFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
  uploadedBy: string;
  createdAt: string;
}

export interface CartLine {
  productId: string;
  stockistId: string;
  qty: number;
  /** PTR when line was last added/updated — used for price-change confirm at checkout */
  unitPriceAtAdd?: number;
}

export interface Cart {
  id: string;
  pharmacyId: string;
  stockistId: string;
  lines: CartLine[];
  updatedAt: string;
}

export interface WishlistItem {
  id: string;
  pharmacyId: string;
  productId: string;
  stockistId: string;
  addedAt: string;
}

export interface PharmacyInventoryItem {
  id: string;
  pharmacyId: string;
  productId: string;
  productName: string;
  batchNumber?: string;
  expiryDate?: string;
  /** Retail MRP when set via manual stock-in (not stored in movement reason). */
  mrp?: number;
  onHand: number;
  updatedAt: string;
}

export interface SeedMeta {
  id: 'meta';
  seedVersion: number;
  seededAt: string;
}

/** Canvas-derived tables (docs/22 / PLAN/04 §9) — Dexie version(2) */

export type SmartOrderRuleTag = 'LowStock' | 'Frequent' | 'NearExpiry';

export interface SmartOrderSellerOption {
  stockistId: string;
  stockistName: string;
  productId: string;
  ptr: number;
  available: number;
  moq: number;
  maxQty?: number;
}

export interface SmartOrderSuggestionLine {
  key: string;
  productName: string;
  brand: string;
  rules: SmartOrderRuleTag[];
  suggestedQty: number;
  sellers: SmartOrderSellerOption[];
  selectedStockistId?: string;
  selectedProductId?: string;
  unavailableReason?: string;
}

export interface SmartOrderAcceptedLine {
  key: string;
  productName: string;
  stockistId: string;
  productId: string;
  qty: number;
  unitPrice: number;
}

export interface SmartOrderRun {
  id: string;
  pharmacyId: string;
  /** Comma-joined scopes: lowStock,frequent,nearExpiry */
  scope: string;
  suggestions: SmartOrderSuggestionLine[];
  acceptedLines: SmartOrderAcceptedLine[];
  createdBy: string;
  createdAt: string;
}

export type CustomerSaleStatus = 'Completed' | 'PartiallyReturned' | 'Returned' | 'Voided';
export type CustomerSalePaymentMode = 'Cash' | 'UPI' | 'Credit';

export interface CustomerSaleLine {
  productRef: string;
  productName: string;
  batchAllocations: { inventoryId: string; batchNumber?: string; expiryDate?: string; qty: number }[];
  qty: number;
  unitPrice: number;
  returnedQty: number;
}

export interface CustomerSaleReturnLine {
  productRef: string;
  qty: number;
  reason: string;
  at: string;
}

export type CustomerSaleDeliveryStatus = 'Unassigned' | 'Assigned' | 'Delivered' | 'Failed';

export interface CustomerSaleCollection {
  id: string;
  amount: number;
  at: string;
  actorId: string;
  note?: string;
}

export interface CustomerSale {
  id: string;
  saleNo: string;
  pharmacyId: string;
  customerName: string;
  phone?: string;
  lines: CustomerSaleLine[];
  paymentMode: CustomerSalePaymentMode;
  /** Cash/UPI: full sale total at create. Credit: rises as collections are recorded. */
  amountCollected: number;
  collections?: CustomerSaleCollection[];
  homeDelivery?: boolean;
  address?: string;
  /** B2C home-delivery logistics state (CF-06); independent of financial sale status */
  deliveryStatus?: CustomerSaleDeliveryStatus;
  routeId?: string;
  status: CustomerSaleStatus;
  returnedLines: CustomerSaleReturnLine[];
  voidReason?: string;
  createdBy: string;
  createdAt: string;
}

export interface DeliveryArea {
  id: string;
  pharmacyId: string;
  name: string;
  pins: string[];
}

export type PharmacyRouteStopStatus = 'Pending' | 'Delivered' | 'Failed';

export interface PharmacyRouteStop {
  saleId: string;
  seq: number;
  status: PharmacyRouteStopStatus;
  failReason?: string;
}

export interface PharmacyRoute {
  id: string;
  pharmacyId: string;
  name: string;
  areaId?: string;
  assigneeUserId?: string;
  stops: PharmacyRouteStop[];
  createdAt: string;
  updatedAt: string;
}

export interface ManagedPharmacy {
  id: string;
  stockistId: string;
  name: string;
  phone: string;
  email?: string;
  gst?: string;
  drugLicense?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  creditLimit?: number;
  creditDays?: number;
  note?: string;
  status: 'OfflineOnly' | 'Invited' | 'Linked';
  inviteId?: string;
  linkedBusinessId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerInvite {
  id: string;
  stockistId: string;
  name: string;
  phone: string;
  email?: string;
  gst?: string;
  status: 'Sent' | 'Registered' | 'Connected' | 'Withdrawn';
  /** Optional link to ManagedPharmacy when invite originates from offline ops. */
  managedPharmacyId?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  stockistId: string;
  name: string;
  contact: string;
  gst?: string;
  terms?: string;
  active: boolean;
}

export type PurchaseOrderStatus =
  | 'Draft'
  | 'Sent'
  | 'PartiallyReceived'
  | 'Received'
  | 'Closed'
  | 'Cancelled';

export interface PurchaseOrder {
  id: string;
  poNo: string;
  stockistId: string;
  supplierId: string;
  lines: { productId: string; productName?: string; qty: number; expectedCost: number; receivedQty: number }[];
  status: PurchaseOrderStatus;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseBill {
  id: string;
  billNo: string;
  stockistId: string;
  supplierId: string;
  date: string;
  amount: number;
  fileId?: string;
  poIds: string[];
  notes?: string;
  createdAt: string;
}

export interface SupplierReturn {
  id: string;
  retNo: string;
  stockistId: string;
  supplierId: string;
  lines: { batchId: string; productId?: string; qty: number; reason: string }[];
  status: 'Draft' | 'Sent' | 'Settled' | 'Cancelled';
  settledNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockistRoute {
  id: string;
  stockistId: string;
  name: string;
  pins: string[];
  assigneeId?: string;
  stops: { deliveryId: string; seq: number }[];
}

export interface UpgradeRequest {
  id: string;
  businessId: string;
  plan: string;
  utr: string;
  proofFileId?: string;
  status: 'Submitted' | 'Approved' | 'Rejected';
  decisionReason?: string;
  decidedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CounterfeitReport {
  id: string;
  reportNo?: string;
  reporterBusinessId: string;
  productId?: string;
  batchId?: string;
  sellerBusinessId?: string;
  description: string;
  evidenceFileIds: string[];
  status: 'Reported' | 'Investigating' | 'RecallIssued' | 'Resolved' | 'Dismissed';
  assigneeId?: string;
  internalNotes: string[];
  outcome?: string;
  decisionReason?: string;
  /** E-CF-24b: linked into another investigation */
  linkedReportId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PriceChange {
  id: string;
  stockistId: string;
  productId: string;
  oldPtr: number;
  newPtr: number;
  oldMrp?: number;
  newMrp?: number;
  source: 'manual' | 'bulk' | 'import';
  actorId: string;
  at: string;
}

export interface Favourite {
  id: string;
  pharmacyId: string;
  stockistId: string;
  /** When false, row holds private rating/note only (not sorted as a pin). Omitted/true = pinned. */
  pinned?: boolean;
  rating?: number;
  note?: string;
}
