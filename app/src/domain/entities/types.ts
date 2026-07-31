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
  | 'Owner'
  | 'Manager'
  | 'Staff'
  | 'Accountant'
  | 'DeliveryBoy'
  | 'SupportAgent'
  | 'Admin'
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
  phone: string;
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
  createdAt: string;
  updatedAt: string;
  suspendedAt?: string;
  suspendReason?: string;
}

export interface User {
  id: string;
  businessId: string;
  name: string;
  email: string;
  phone: string;
  role: OperationalRole;
  status: UserStatus;
  passwordSalt: string;
  passwordHash: string;
  inviteToken?: string;
  inviteExpiresAt?: string;
  permissionOverrides?: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
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
  | 'Quarantine'
  | 'GRNIn'
  | 'Transfer';

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
  unitPrice: number;
  mrp: number;
  gstPercent: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
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
  idempotencyKey: string;
  statusHistory: StatusHistoryEntry[];
  invoiceId?: string;
  deliveryId?: string;
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
  lines: DeliveryLine[];
  podFileId?: string;
  failReason?: string;
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
  reason: string;
  batchNumber?: string;
  deliveryId: string;
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
  returnId: string;
  stockistId: string;
  pharmacyId: string;
  status: CreditNoteStatus;
  amount: number;
  remaining: number;
  applications: CreditApplication[];
  issuedAt: string;
  issuedBy: string;
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
  onHand: number;
  updatedAt: string;
}

export interface SeedMeta {
  id: 'meta';
  seedVersion: number;
  seededAt: string;
}
