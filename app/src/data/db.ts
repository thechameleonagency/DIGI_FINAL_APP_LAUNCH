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
  CreditNote,
  Delivery,
  InventoryMovement,
  Invoice,
  Message,
  MessageThread,
  Notification,
  Order,
  Payment,
  PharmacyInventoryItem,
  PlatformSettings,
  Product,
  ReturnRequest,
  SeedMeta,
  StoredFile,
  SupportTicket,
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
  }
}

export const db = new DigiSwasthyaDB();
