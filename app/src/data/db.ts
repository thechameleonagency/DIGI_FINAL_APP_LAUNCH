import Dexie, { type Table } from 'dexie';
import type {
  Announcement,
  AuditLog,
  Banner,
  Batch,
  Business,
  Cart,
  Catalogue,
  Connection,
  CounterfeitAlert,
  CounterfeitReport,
  CreditNote,
  CustomerSale,
  Delivery,
  DeliveryArea,
  Favourite,
  InventoryMovement,
  Invoice,
  ManagedSupplier,
  ManagedSupplierBill,
  Message,
  MessageThread,
  Notification,
  Order,
  PartnerInvite,
  ManagedPharmacy,
  Payment,
  PaymentIntent,
  PharmacyInventoryItem,
  PharmacyRoute,
  PlatformFeeCharge,
  PlatformSettings,
  PriceChange,
  Product,
  PurchaseBill,
  PurchaseOrder,
  ReturnRequest,
  SeedMeta,
  Settlement,
  SmartOrderRun,
  StockistRoute,
  StoredFile,
  Supplier,
  SupplierReturn,
  SupportTicket,
  UpgradeRequest,
  User,
  Verification,
  WishlistItem,
} from '../domain/entities/types';

export class DigiSwasthyaDB extends Dexie {
  businesses!: Table<Business, string>;
  users!: Table<User, string>;
  verifications!: Table<Verification, string>;
  connections!: Table<Connection, string>;
  catalogues!: Table<Catalogue, string>;
  products!: Table<Product, string>;
  batches!: Table<Batch, string>;
  inventoryMovements!: Table<InventoryMovement, string>;
  orders!: Table<Order, string>;
  deliveries!: Table<Delivery, string>;
  invoices!: Table<Invoice, string>;
  payments!: Table<Payment, string>;
  returns!: Table<ReturnRequest, string>;
  creditNotes!: Table<CreditNote, string>;
  notifications!: Table<Notification, string>;
  messageThreads!: Table<MessageThread, string>;
  messages!: Table<Message, string>;
  supportTickets!: Table<SupportTicket, string>;
  announcements!: Table<Announcement, string>;
  banners!: Table<Banner, string>;
  auditLogs!: Table<AuditLog, string>;
  platformSettings!: Table<PlatformSettings, string>;
  files!: Table<StoredFile, string>;
  carts!: Table<Cart, string>;
  wishlists!: Table<WishlistItem, string>;
  pharmacyInventory!: Table<PharmacyInventoryItem, string>;
  seedMeta!: Table<SeedMeta, string>;
  smartOrderRuns!: Table<SmartOrderRun, string>;
  customerSales!: Table<CustomerSale, string>;
  deliveryAreas!: Table<DeliveryArea, string>;
  pharmacyRoutes!: Table<PharmacyRoute, string>;
  managedPharmacies!: Table<ManagedPharmacy, string>;
  partnerInvites!: Table<PartnerInvite, string>;
  suppliers!: Table<Supplier, string>;
  purchaseOrders!: Table<PurchaseOrder, string>;
  purchaseBills!: Table<PurchaseBill, string>;
  supplierReturns!: Table<SupplierReturn, string>;
  stockistRoutes!: Table<StockistRoute, string>;
  upgradeRequests!: Table<UpgradeRequest, string>;
  counterfeitReports!: Table<CounterfeitReport, string>;
  priceChanges!: Table<PriceChange, string>;
  favourites!: Table<Favourite, string>;
  paymentIntents!: Table<PaymentIntent, string>;
  settlements!: Table<Settlement, string>;
  platformFeeCharges!: Table<PlatformFeeCharge, string>;
  counterfeitAlerts!: Table<CounterfeitAlert, string>;
  managedSuppliers!: Table<ManagedSupplier, string>;
  managedSupplierBills!: Table<ManagedSupplierBill, string>;

  constructor() {
    super('DigiSwasthyaDB');
    this.version(1).stores({
      businesses: 'id, type, accountStatus, verificationStatus, gstNumber, drugLicenseNumber, city, email',
      users: 'id, businessId, phone, email, status, role, inviteToken',
      verifications: 'id, businessId, status',
      connections: 'id, pharmacyId, stockistId, status, [pharmacyId+stockistId]',
      catalogues: 'id, stockistId, status',
      products: 'id, stockistId, catalogueId, sku, category, brand, status, name',
      batches: 'id, productId, stockistId, batchNumber, expiryDate, status',
      inventoryMovements: 'id, businessId, productId, batchId, at, type',
      orders: 'id, orderNo, pharmacyId, stockistId, status, placedAt, idempotencyKey',
      deliveries: 'id, deliveryNo, orderId, stockistId, pharmacyId, status, assignedTo',
      invoices: 'id, invoiceNo, orderId, stockistId, pharmacyId, status, dueDate',
      payments: 'id, paymentNo, pharmacyId, stockistId, status, reference, idempotencyKey',
      returns: 'id, returnNo, pharmacyId, stockistId, orderId, status',
      creditNotes: 'id, creditNoteNo, returnId, stockistId, pharmacyId, status',
      notifications: 'id, userId, businessId, status, code, createdAt',
      messageThreads: 'id, lastMessageAt',
      messages: 'id, threadId, senderId, createdAt',
      supportTickets: 'id, ticketNo, businessId, status, createdBy, assigneeId',
      announcements: 'id, active, startsAt',
      banners: 'id, active, startsAt',
      auditLogs: 'id, at, entityType, entityId, actorId, action',
      platformSettings: 'id',
      files: 'id, uploadedBy, createdAt',
      carts: 'id, pharmacyId, stockistId',
      wishlists: 'id, pharmacyId, productId, stockistId',
      pharmacyInventory: 'id, pharmacyId, productId',
      seedMeta: 'id',
    });
    this.version(2).stores({
      smartOrderRuns: 'id, pharmacyId',
      customerSales: 'id, pharmacyId, saleNo',
      deliveryAreas: 'id, pharmacyId',
      pharmacyRoutes: 'id, pharmacyId',
      partnershipApplications: 'id, pharmacyId, status',
      partnerInvites: 'id, stockistId, phone',
      suppliers: 'id, stockistId',
      purchaseOrders: 'id, stockistId, supplierId, status',
      purchaseBills: 'id, stockistId, supplierId',
      supplierReturns: 'id, stockistId, status',
      stockistRoutes: 'id, stockistId',
      upgradeRequests: 'id, businessId, status, utr',
      counterfeitReports: 'id, status, batchId',
      priceChanges: 'id, stockistId, productId',
      favourites: 'id, [pharmacyId+stockistId], pharmacyId, stockistId',
    });
    this.version(3).stores({
      partnershipApplications: null,
      managedPharmacies: 'id, stockistId, status, phone, linkedBusinessId',
      partnerInvites: 'id, stockistId, phone, managedPharmacyId',
    });
    this.version(4).stores({
      paymentIntents: 'id, pharmacyId, status, intentNo',
      settlements: 'id, stockistId, status, paymentIntentId, settlementNo',
      platformFeeCharges: 'id, stockistId, pharmacyId, status, orderId, invoiceId',
      counterfeitAlerts: 'id, active, alertType',
      managedSuppliers: 'id, pharmacyId, active, name',
      managedSupplierBills: 'id, pharmacyId, supplierId, billNo',
      products: 'id, stockistId, catalogueId, sku, category, brand, status, name, listedForSale, scheduleType',
      connections: 'id, pharmacyId, stockistId, status, inCircle, [pharmacyId+stockistId]',
    });
  }
}

export const db = new DigiSwasthyaDB();
