import { addDays, formatISO, subDays } from 'date-fns';
import type {
  Batch,
  Business,
  Connection,
  Delivery,
  Invoice,
  Order,
  Payment,
  PlatformSettings,
  Product,
  User,
  Verification,
} from '../domain/entities/types';
import { calcInvoiceLine, calcInvoiceTotals, calcOrderLine, calcOrderTotals, invoiceOutstanding } from '../domain/calc';
import { hashPassword, randomSalt } from '../domain/utils/crypto';
import { newId, resetCounters, setCounter } from '../domain/utils/ids';
import { db } from './db';

export const SEED_VERSION = 2;

const now = () => new Date();
const iso = (d: Date) => formatISO(d);

async function makeUser(
  partial: Omit<User, 'passwordSalt' | 'passwordHash' | 'createdAt' | 'updatedAt'> & { password: string },
): Promise<User> {
  const salt = randomSalt();
  const passwordHash = await hashPassword(partial.password, salt);
  const { password: _, ...rest } = partial;
  return {
    ...rest,
    passwordSalt: salt,
    passwordHash,
    createdAt: iso(now()),
    updatedAt: iso(now()),
  };
}

const PRODUCT_DEFS = [
  { name: 'Augmentin 625 Duo', brand: 'GSK', category: 'Tablets', sku: 'AUG-625', pack: '10 Tab', mrp: 220, ptr: 168, gst: 12, moq: 5 },
  { name: 'Dolo 650', brand: 'Micro Labs', category: 'Tablets', sku: 'DOLO-650', pack: '15 Tab', mrp: 35, ptr: 24, gst: 12, moq: 10 },
  { name: 'Pantocid DSR', brand: 'Sun Pharma', category: 'Capsules', sku: 'PANT-DSR', pack: '15 Cap', mrp: 185, ptr: 132, gst: 12, moq: 5 },
  { name: 'Azithral 500', brand: 'Alembic', category: 'Tablets', sku: 'AZI-500', pack: '5 Tab', mrp: 132, ptr: 95, gst: 12, moq: 5 },
  { name: 'Cetrizine 10mg', brand: 'Dr Reddy', category: 'Tablets', sku: 'CET-10', pack: '10 Tab', mrp: 28, ptr: 18, gst: 12, moq: 20 },
  { name: 'Montair LC', brand: 'Cipla', category: 'Tablets', sku: 'MONT-LC', pack: '10 Tab', mrp: 210, ptr: 155, gst: 12, moq: 5 },
  { name: 'Glycomet GP1', brand: 'USV', category: 'Tablets', sku: 'GLY-GP1', pack: '15 Tab', mrp: 95, ptr: 68, gst: 12, moq: 10 },
  { name: 'Thyronorm 50', brand: 'Abbott', category: 'Tablets', sku: 'THY-50', pack: '120 Tab', mrp: 168, ptr: 125, gst: 12, moq: 2 },
  { name: 'Ecosprin 75', brand: 'USV', category: 'Tablets', sku: 'ECO-75', pack: '14 Tab', mrp: 8, ptr: 5, gst: 12, moq: 50 },
  { name: 'Shelcal 500', brand: 'Torrent', category: 'Tablets', sku: 'SHEL-500', pack: '15 Tab', mrp: 130, ptr: 95, gst: 12, moq: 10 },
  { name: 'Becosules Z', brand: 'Pfizer', category: 'Capsules', sku: 'BECO-Z', pack: '20 Cap', mrp: 55, ptr: 38, gst: 12, moq: 10 },
  { name: 'Volini Gel 30g', brand: 'Sun Pharma', category: 'OTC', sku: 'VOL-30', pack: '30g', mrp: 145, ptr: 105, gst: 18, moq: 5 },
  { name: 'Crocin Advance', brand: 'GSK', category: 'Tablets', sku: 'CRO-ADV', pack: '15 Tab', mrp: 32, ptr: 22, gst: 12, moq: 20 },
  { name: 'Allegra 120', brand: 'Sanofi', category: 'Tablets', sku: 'ALL-120', pack: '10 Tab', mrp: 210, ptr: 158, gst: 12, moq: 5 },
  { name: 'Foracort 200 Inhaler', brand: 'Cipla', category: 'Devices', sku: 'FOR-200', pack: '1 Inhaler', mrp: 420, ptr: 310, gst: 12, moq: 1 },
  { name: 'Omez 20', brand: 'Dr Reddy', category: 'Capsules', sku: 'OMEZ-20', pack: '20 Cap', mrp: 72, ptr: 48, gst: 12, moq: 10 },
  { name: 'Zerodol SP', brand: 'Ipca', category: 'Tablets', sku: 'ZERO-SP', pack: '10 Tab', mrp: 98, ptr: 70, gst: 12, moq: 10 },
  { name: 'Liv 52 DS', brand: 'Himalaya', category: 'Tablets', sku: 'LIV-52', pack: '60 Tab', mrp: 210, ptr: 150, gst: 12, moq: 5 },
  { name: 'ORS-L Sachet', brand: 'Cipla', category: 'OTC', sku: 'ORS-L', pack: '21g', mrp: 22, ptr: 14, gst: 12, moq: 50 },
  { name: 'Betadine Ointment 20g', brand: 'Win-Medicare', category: 'OTC', sku: 'BET-20', pack: '20g', mrp: 95, ptr: 68, gst: 12, moq: 10 },
  { name: 'Near-Expiry Sample Tab', brand: 'Demo', category: 'Tablets', sku: 'NEAR-EXP', pack: '10 Tab', mrp: 50, ptr: 30, gst: 12, moq: 1 },
  { name: 'Expired Demo Tab', brand: 'Demo', category: 'Tablets', sku: 'EXP-DEMO', pack: '10 Tab', mrp: 40, ptr: 20, gst: 12, moq: 1 },
];

async function clearAllTables(): Promise<void> {
  for (const table of db.tables) {
    try {
      await table.clear();
    } catch {
      // continue clearing other tables
    }
  }
}

export async function ensureSeeded(): Promise<void> {
  try {
    await db.open();
  } catch {
    // continue — open may already be in progress
  }
  const meta = await db.seedMeta.get('meta').catch(() => undefined);
  const pharmacyUser = await db.users.where('email').equals('neha@careplus.pune.in').first().catch(() => undefined);
  const orderCount = await db.orders.count().catch(() => 0);
  if (meta?.seedVersion === SEED_VERSION && pharmacyUser && orderCount >= 3) return;

  await clearAllTables();
  try {
    await seedAll();
  } catch (err) {
    // Retry once after hard delete (handles half-written state / blocked prior clear)
    console.warn('Seed failed, retrying', err);
    try {
      await db.delete();
      await db.open();
    } catch {
      await clearAllTables();
    }
    await seedAll();
  }
}

export async function seedAll(): Promise<void> {
  resetCounters();
  setCounter('ORD', '2026', 200);
  setCounter('INV', '2026', 500);
  setCounter('PAY', '2026', 300);
  setCounter('DEL', '2026', 100);
  setCounter('RET', '2026', 50);
  setCounter('CN', '2026', 40);
  setCounter('TKT', '2026', 10);

  const platformId = 'biz-platform';
  const stockistId = 'biz-medroute';
  const pharmacyId = 'biz-careplus';
  const unverifiedPharmId = 'biz-greenleaf';

  const adminId = 'user-admin';
  const stockistOwnerId = 'user-vikram';
  const stockistManagerId = 'user-meera';
  const stockistAcctId = 'user-ravi';
  const deliveryBoyId = 'user-amit';
  const pharmacyOwnerId = 'user-neha';
  const pharmacyStaffId = 'user-priya';
  const pharmacyAcctId = 'user-suresh';
  const unverifiedOwnerId = 'user-kavita';

  const businesses: Business[] = [
    {
      id: platformId,
      type: 'Platform',
      name: 'DigiSwasthya Ops',
      phone: '+91 90000 00001',
      email: 'admin@digiswasthya.in',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      address: 'DigiSwasthya HQ, Pune',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: adminId,
      createdAt: iso(subDays(now(), 120)),
      updatedAt: iso(now()),
    },
    {
      id: stockistId,
      type: 'Stockist',
      name: 'MedRoute Distributors',
      legalName: 'MedRoute Distributors Pvt Ltd',
      gstNumber: '27ABCDE1234F1Z5',
      drugLicenseNumber: 'MH-WD-2024-8891',
      phone: '+91 98765 43210',
      email: 'vikram@medroute.in',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411037',
      address: '42 Wholesale Hub, Market Yard, Gultekdi, Pune',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: stockistOwnerId,
      bankAccountNumber: '50100123456789',
      bankIfsc: 'HDFC0001234',
      bankName: 'HDFC Bank',
      upiId: 'medroute@hdfc',
      accountHolderName: 'MedRoute Distributors',
      servicePins: ['411001', '411037', '411038', '411045'],
      creditDaysDefault: 30,
      createdAt: iso(subDays(now(), 90)),
      updatedAt: iso(now()),
    },
    {
      id: pharmacyId,
      type: 'Pharmacy',
      name: 'CarePlus Chemists',
      legalName: 'CarePlus Chemists',
      gstNumber: '27PQRSX6789L1Z2',
      drugLicenseNumber: 'MH-20-21456',
      phone: '+91 98230 11220',
      email: 'neha@careplus.pune.in',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411038',
      address: '18 Karve Road, Kothrud, Pune',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: pharmacyOwnerId,
      bankAccountNumber: '628901234567',
      bankIfsc: 'ICIC0006289',
      bankName: 'ICICI Bank',
      upiId: 'careplus@icici',
      accountHolderName: 'CarePlus Chemists',
      createdAt: iso(subDays(now(), 80)),
      updatedAt: iso(now()),
    },
    {
      id: unverifiedPharmId,
      type: 'Pharmacy',
      name: 'GreenLeaf Pharmacy',
      gstNumber: '27GREEN1234A1Z9',
      drugLicenseNumber: 'MH-20-99881',
      phone: '+91 97654 22110',
      email: 'kavita@greenleaf.pharmacy.in',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411045',
      address: '7 Baner Road, Pune',
      accountStatus: 'Active',
      verificationStatus: 'UnderReview',
      ownerUserId: unverifiedOwnerId,
      createdAt: iso(subDays(now(), 5)),
      updatedAt: iso(now()),
    },
  ];

  const users: User[] = await Promise.all([
    makeUser({
      id: adminId, businessId: platformId, name: 'Priya Nair', email: 'admin@digiswasthya.in',
      phone: '+91 90000 00001', role: 'SuperAdmin', status: 'Active', password: 'Admin@2026',
    }),
    makeUser({
      id: stockistOwnerId, businessId: stockistId, name: 'Vikram Rao', email: 'vikram@medroute.in',
      phone: '+91 98765 43210', role: 'Owner', status: 'Active', password: 'Stockist@2026',
    }),
    makeUser({
      id: stockistManagerId, businessId: stockistId, name: 'Meera Shah', email: 'meera@medroute.in',
      phone: '+91 98765 43211', role: 'Manager', status: 'Active', password: 'Stockist@2026',
    }),
    makeUser({
      id: stockistAcctId, businessId: stockistId, name: 'Ravi Deshmukh', email: 'ravi@medroute.in',
      phone: '+91 98765 43212', role: 'Accountant', status: 'Active', password: 'Stockist@2026',
    }),
    makeUser({
      id: deliveryBoyId, businessId: stockistId, name: 'Amit Patil', email: 'amit@medroute.in',
      phone: '+91 98765 43213', role: 'DeliveryBoy', status: 'Active', password: 'Stockist@2026',
    }),
    makeUser({
      id: pharmacyOwnerId, businessId: pharmacyId, name: 'Neha Kulkarni', email: 'neha@careplus.pune.in',
      phone: '+91 98230 11220', role: 'Owner', status: 'Active', password: 'Pharmacy@2026',
    }),
    makeUser({
      id: pharmacyStaffId, businessId: pharmacyId, name: 'Priya Joshi', email: 'priya@careplus.pune.in',
      phone: '+91 98230 11221', role: 'Staff', status: 'Active', password: 'Pharmacy@2026',
    }),
    makeUser({
      id: pharmacyAcctId, businessId: pharmacyId, name: 'Suresh Patil', email: 'suresh@careplus.pune.in',
      phone: '+91 98230 11222', role: 'Accountant', status: 'Active', password: 'Pharmacy@2026',
    }),
    makeUser({
      id: unverifiedOwnerId, businessId: unverifiedPharmId, name: 'Kavita More', email: 'kavita@greenleaf.pharmacy.in',
      phone: '+91 97654 22110', role: 'Owner', status: 'Active', password: 'Pharmacy@2026',
    }),
  ]);

  const verifications: Verification[] = [
    {
      id: 'ver-medroute', businessId: stockistId, status: 'Approved',
      submittedAt: iso(subDays(now(), 85)), reviewedAt: iso(subDays(now(), 84)),
      reviewerId: adminId, documentIds: [], decisionHistory: [
        { from: 'NotStarted', to: 'Submitted', at: iso(subDays(now(), 85)), actorId: stockistOwnerId },
        { from: 'Submitted', to: 'UnderReview', at: iso(subDays(now(), 85)), actorId: adminId },
        { from: 'UnderReview', to: 'Approved', at: iso(subDays(now(), 84)), actorId: adminId },
      ],
      createdAt: iso(subDays(now(), 85)), updatedAt: iso(subDays(now(), 84)),
    },
    {
      id: 'ver-careplus', businessId: pharmacyId, status: 'Approved',
      submittedAt: iso(subDays(now(), 78)), reviewedAt: iso(subDays(now(), 77)),
      reviewerId: adminId, documentIds: [], decisionHistory: [
        { from: 'NotStarted', to: 'Submitted', at: iso(subDays(now(), 78)), actorId: pharmacyOwnerId },
        { from: 'Submitted', to: 'UnderReview', at: iso(subDays(now(), 78)), actorId: adminId },
        { from: 'UnderReview', to: 'Approved', at: iso(subDays(now(), 77)), actorId: adminId },
      ],
      createdAt: iso(subDays(now(), 78)), updatedAt: iso(subDays(now(), 77)),
    },
    {
      id: 'ver-greenleaf', businessId: unverifiedPharmId, status: 'UnderReview',
      submittedAt: iso(subDays(now(), 2)), documentIds: [], decisionHistory: [
        { from: 'NotStarted', to: 'Submitted', at: iso(subDays(now(), 2)), actorId: unverifiedOwnerId },
        { from: 'Submitted', to: 'UnderReview', at: iso(subDays(now(), 1)), actorId: adminId },
      ],
      createdAt: iso(subDays(now(), 2)), updatedAt: iso(subDays(now(), 1)),
    },
  ];

  const connectionId = 'conn-careplus-medroute';
  const connections: Connection[] = [
    {
      id: connectionId,
      pharmacyId,
      stockistId,
      status: 'Active',
      requestedAt: iso(subDays(now(), 70)),
      respondedAt: iso(subDays(now(), 69)),
      creditDays: 30,
      creditLimit: 500000,
      customerPricingEnabled: true,
      statusHistory: [
        { from: 'Requested', to: 'Active', at: iso(subDays(now(), 69)), actorId: stockistOwnerId },
      ],
      createdAt: iso(subDays(now(), 70)),
      updatedAt: iso(subDays(now(), 69)),
    },
  ];

  const catalogueId = 'cat-medroute';
  const products: Product[] = PRODUCT_DEFS.map((p, i) => ({
    id: `prod-${i + 1}`,
    stockistId,
    catalogueId,
    name: p.name,
    sku: p.sku,
    brand: p.brand,
    category: p.category,
    packSize: p.pack,
    mrp: p.mrp,
    ptr: p.ptr,
    gstPercent: p.gst,
    moq: p.moq,
    status: 'Active' as const,
    hsn: '3004',
    createdAt: iso(subDays(now(), 60)),
    updatedAt: iso(now()),
  }));

  const batches: Batch[] = [];
  products.forEach((p, i) => {
    if (p.sku === 'EXP-DEMO') {
      batches.push({
        id: `batch-${i + 1}-a`,
        productId: p.id,
        stockistId,
        batchNumber: `EXP${1000 + i}`,
        expiryDate: iso(subDays(now(), 10)).slice(0, 10),
        onHand: 50,
        reserved: 0,
        cost: p.ptr * 0.8,
        status: 'Expired',
        createdAt: iso(subDays(now(), 400)),
        updatedAt: iso(now()),
      });
      return;
    }
    const near = p.sku === 'NEAR-EXP';
    batches.push({
      id: `batch-${i + 1}-a`,
      productId: p.id,
      stockistId,
      batchNumber: `MR${2026}${String(i + 1).padStart(3, '0')}A`,
      expiryDate: iso(addDays(now(), near ? 20 : 400 + i * 10)).slice(0, 10),
      onHand: near ? 30 : 200 + i * 5,
      reserved: 0,
      cost: p.ptr * 0.85,
      status: 'Available',
      createdAt: iso(subDays(now(), 40)),
      updatedAt: iso(now()),
    });
    if (!near) {
      batches.push({
        id: `batch-${i + 1}-b`,
        productId: p.id,
        stockistId,
        batchNumber: `MR${2026}${String(i + 1).padStart(3, '0')}B`,
        expiryDate: iso(addDays(now(), 200 + i * 5)).slice(0, 10),
        onHand: 80,
        reserved: 0,
        cost: p.ptr * 0.85,
        status: 'Available',
        createdAt: iso(subDays(now(), 20)),
        updatedAt: iso(now()),
      });
    }
  });

  const deliveryAddress = {
    id: 'addr-careplus-1',
    label: 'Storefront',
    line1: '18 Karve Road',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411038',
    isDefault: true,
  };

  // Delivered order with invoice partially paid — golden path mid-settlement
  const deliveredLines = [products[0], products[1], products[2]].map((p) => {
    const qty = p.sku === 'DOLO-650' ? 40 : 20;
    const c = calcOrderLine({ qty, unitPrice: p.ptr, gstPercent: p.gstPercent });
    return {
      id: newId(),
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      packSize: p.packSize,
      qty,
      acceptedQty: qty,
      allocatedQty: qty,
      packedQty: qty,
      deliveredQty: qty,
      receivedQty: qty,
      unitPrice: p.ptr,
      mrp: p.mrp,
      gstPercent: p.gstPercent,
      ...c,
      batchAllocations: [
        {
          batchId: batches.find((b) => b.productId === p.id)!.id,
          batchNumber: batches.find((b) => b.productId === p.id)!.batchNumber,
          qty,
          expiryDate: batches.find((b) => b.productId === p.id)!.expiryDate,
        },
      ],
    };
  });
  const deliveredTotals = calcOrderTotals(deliveredLines);
  const deliveredOrderId = 'ord-delivered-1';
  const deliveredOrder: Order = {
    id: deliveredOrderId,
    orderNo: 'ORD-2026-0201',
    pharmacyId,
    stockistId,
    connectionId,
    status: 'Delivered',
    lines: deliveredLines,
    ...deliveredTotals,
    deliveryAddress,
    notes: 'Morning delivery preferred',
    idempotencyKey: 'seed-ord-0201',
    statusHistory: [
      { from: 'Draft', to: 'Pending', at: iso(subDays(now(), 14)), actorId: pharmacyOwnerId },
      { from: 'Pending', to: 'Accepted', at: iso(subDays(now(), 13)), actorId: stockistOwnerId },
      { from: 'Accepted', to: 'Allocated', at: iso(subDays(now(), 13)), actorId: stockistManagerId },
      { from: 'Allocated', to: 'Packed', at: iso(subDays(now(), 12)), actorId: stockistManagerId },
      { from: 'Packed', to: 'Dispatched', at: iso(subDays(now(), 12)), actorId: stockistManagerId },
      { from: 'Dispatched', to: 'Delivered', at: iso(subDays(now(), 11)), actorId: deliveryBoyId },
    ],
    placedBy: pharmacyOwnerId,
    placedAt: iso(subDays(now(), 14)),
    createdAt: iso(subDays(now(), 14)),
    updatedAt: iso(subDays(now(), 11)),
    version: 6,
  };

  const invLines = deliveredLines.map((l) => {
    const c = calcInvoiceLine({ qty: l.qty, unitPrice: l.unitPrice, gstPercent: l.gstPercent });
    return {
      productId: l.productId,
      productName: l.productName,
      sku: l.sku,
      qty: l.qty,
      unitPrice: l.unitPrice,
      gstPercent: l.gstPercent,
      ...c,
      batchNumber: l.batchAllocations?.[0]?.batchNumber,
      expiryDate: l.batchAllocations?.[0]?.expiryDate,
    };
  });
  const invTotals = calcInvoiceTotals(invLines);
  const invoiceId = 'inv-0501';
  const partialPaid = 2000;
  const invoice: Invoice = {
    id: invoiceId,
    invoiceNo: 'INV-2026-0501',
    orderId: deliveredOrderId,
    stockistId,
    pharmacyId,
    status: 'PartiallyPaid',
    lines: invLines,
    ...invTotals,
    outstanding: invoiceOutstanding({ ...invTotals, paidAmount: partialPaid, creditApplied: 0 }),
    paidAmount: partialPaid,
    creditApplied: 0,
    issuedAt: iso(subDays(now(), 12)),
    dueDate: iso(addDays(subDays(now(), 12), 30)).slice(0, 10),
    statusHistory: [
      { from: 'Draft', to: 'Issued', at: iso(subDays(now(), 12)), actorId: stockistAcctId },
      { from: 'Issued', to: 'PartiallyPaid', at: iso(subDays(now(), 5)), actorId: stockistAcctId },
    ],
    createdAt: iso(subDays(now(), 12)),
    updatedAt: iso(subDays(now(), 5)),
    version: 2,
  };
  deliveredOrder.invoiceId = invoiceId;

  const delivery: Delivery = {
    id: 'del-0101',
    deliveryNo: 'DEL-2026-0101',
    orderId: deliveredOrderId,
    invoiceId,
    stockistId,
    pharmacyId,
    status: 'Delivered',
    assignedTo: deliveryBoyId,
    lines: deliveredLines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      qty: l.qty,
      deliveredQty: l.qty,
      batchNumber: l.batchAllocations?.[0]?.batchNumber,
      expiryDate: l.batchAllocations?.[0]?.expiryDate,
    })),
    statusHistory: [
      { from: 'Created', to: 'Assigned', at: iso(subDays(now(), 12)), actorId: stockistManagerId },
      { from: 'Assigned', to: 'OutForDelivery', at: iso(subDays(now(), 11)), actorId: deliveryBoyId },
      { from: 'OutForDelivery', to: 'Delivered', at: iso(subDays(now(), 11)), actorId: deliveryBoyId },
    ],
    createdAt: iso(subDays(now(), 12)),
    updatedAt: iso(subDays(now(), 11)),
    deliveredAt: iso(subDays(now(), 11)),
  };
  deliveredOrder.deliveryId = delivery.id;

  const payment: Payment = {
    id: 'pay-0301',
    paymentNo: 'PAY-2026-0301',
    pharmacyId,
    stockistId,
    status: 'Approved',
    amount: partialPaid,
    method: 'UPI',
    reference: 'UPI123456789',
    allocations: [{ invoiceId, invoiceNo: invoice.invoiceNo, amount: partialPaid }],
    submittedBy: pharmacyAcctId,
    submittedAt: iso(subDays(now(), 6)),
    reviewedBy: stockistAcctId,
    reviewedAt: iso(subDays(now(), 5)),
    idempotencyKey: 'seed-pay-0301',
    statusHistory: [
      { from: 'Draft', to: 'Submitted', at: iso(subDays(now(), 6)), actorId: pharmacyAcctId },
      { from: 'Submitted', to: 'Approved', at: iso(subDays(now(), 5)), actorId: stockistAcctId },
    ],
    createdAt: iso(subDays(now(), 6)),
    updatedAt: iso(subDays(now(), 5)),
  };

  // Pending order for fulfilment demo
  const pendingLines = [products[3], products[4]].map((p) => {
    const qty = 15;
    const c = calcOrderLine({ qty, unitPrice: p.ptr, gstPercent: p.gstPercent });
    return {
      id: newId(),
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      packSize: p.packSize,
      qty,
      unitPrice: p.ptr,
      mrp: p.mrp,
      gstPercent: p.gstPercent,
      ...c,
    };
  });
  const pendingTotals = calcOrderTotals(pendingLines);
  const pendingOrder: Order = {
    id: 'ord-pending-1',
    orderNo: 'ORD-2026-0202',
    pharmacyId,
    stockistId,
    connectionId,
    status: 'Pending',
    lines: pendingLines,
    ...pendingTotals,
    deliveryAddress,
    idempotencyKey: 'seed-ord-0202',
    statusHistory: [
      { from: 'Draft', to: 'Pending', at: iso(subDays(now(), 1)), actorId: pharmacyOwnerId },
    ],
    placedBy: pharmacyOwnerId,
    placedAt: iso(subDays(now(), 1)),
    createdAt: iso(subDays(now(), 1)),
    updatedAt: iso(subDays(now(), 1)),
    version: 1,
  };

  // Accepted order ready to allocate
  const acceptedLines = [products[5]].map((p) => {
    const qty = 10;
    const c = calcOrderLine({ qty, unitPrice: p.ptr, gstPercent: p.gstPercent });
    return {
      id: newId(),
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      packSize: p.packSize,
      qty,
      acceptedQty: qty,
      unitPrice: p.ptr,
      mrp: p.mrp,
      gstPercent: p.gstPercent,
      ...c,
    };
  });
  const acceptedOrder: Order = {
    id: 'ord-accepted-1',
    orderNo: 'ORD-2026-0203',
    pharmacyId,
    stockistId,
    connectionId,
    status: 'Accepted',
    lines: acceptedLines,
    ...calcOrderTotals(acceptedLines),
    deliveryAddress,
    idempotencyKey: 'seed-ord-0203',
    statusHistory: [
      { from: 'Draft', to: 'Pending', at: iso(subDays(now(), 2)), actorId: pharmacyStaffId },
      { from: 'Pending', to: 'Accepted', at: iso(subDays(now(), 2)), actorId: stockistOwnerId },
    ],
    placedBy: pharmacyStaffId,
    placedAt: iso(subDays(now(), 2)),
    createdAt: iso(subDays(now(), 2)),
    updatedAt: iso(subDays(now(), 2)),
    version: 2,
  };

  // Returnable: small delivered order for return demo
  const returnableLines = [products[9]].map((p) => {
    const qty = 10;
    const c = calcOrderLine({ qty, unitPrice: p.ptr, gstPercent: p.gstPercent });
    return {
      id: newId(),
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      packSize: p.packSize,
      qty,
      acceptedQty: qty,
      allocatedQty: qty,
      packedQty: qty,
      deliveredQty: qty,
      receivedQty: qty,
      unitPrice: p.ptr,
      mrp: p.mrp,
      gstPercent: p.gstPercent,
      ...c,
      batchAllocations: [
        {
          batchId: batches.find((b) => b.productId === p.id)!.id,
          batchNumber: batches.find((b) => b.productId === p.id)!.batchNumber,
          qty,
          expiryDate: batches.find((b) => b.productId === p.id)!.expiryDate,
        },
      ],
    };
  });
  const returnableOrderId = 'ord-returnable-1';
  const returnableInvId = 'inv-0502';
  const returnableOrder: Order = {
    id: returnableOrderId,
    orderNo: 'ORD-2026-0204',
    pharmacyId,
    stockistId,
    connectionId,
    status: 'Delivered',
    lines: returnableLines,
    ...calcOrderTotals(returnableLines),
    deliveryAddress,
    idempotencyKey: 'seed-ord-0204',
    invoiceId: returnableInvId,
    deliveryId: 'del-0102',
    statusHistory: [
      { from: 'Draft', to: 'Pending', at: iso(subDays(now(), 4)), actorId: pharmacyOwnerId },
      { from: 'Pending', to: 'Accepted', at: iso(subDays(now(), 4)), actorId: stockistOwnerId },
      { from: 'Accepted', to: 'Allocated', at: iso(subDays(now(), 3)), actorId: stockistManagerId },
      { from: 'Allocated', to: 'Packed', at: iso(subDays(now(), 3)), actorId: stockistManagerId },
      { from: 'Packed', to: 'Dispatched', at: iso(subDays(now(), 3)), actorId: stockistManagerId },
      { from: 'Dispatched', to: 'Delivered', at: iso(subDays(now(), 2)), actorId: deliveryBoyId },
    ],
    placedBy: pharmacyOwnerId,
    placedAt: iso(subDays(now(), 4)),
    createdAt: iso(subDays(now(), 4)),
    updatedAt: iso(subDays(now(), 2)),
    version: 6,
  };

  const retInvLines = returnableLines.map((l) => {
    const c = calcInvoiceLine({ qty: l.qty, unitPrice: l.unitPrice, gstPercent: l.gstPercent });
    return {
      productId: l.productId,
      productName: l.productName,
      sku: l.sku,
      qty: l.qty,
      unitPrice: l.unitPrice,
      gstPercent: l.gstPercent,
      ...c,
      batchNumber: l.batchAllocations?.[0]?.batchNumber,
      expiryDate: l.batchAllocations?.[0]?.expiryDate,
    };
  });
  const retInvTotals = calcInvoiceTotals(retInvLines);
  const returnableInvoice: Invoice = {
    id: returnableInvId,
    invoiceNo: 'INV-2026-0502',
    orderId: returnableOrderId,
    stockistId,
    pharmacyId,
    status: 'Issued',
    lines: retInvLines,
    ...retInvTotals,
    outstanding: retInvTotals.grandTotal,
    paidAmount: 0,
    creditApplied: 0,
    issuedAt: iso(subDays(now(), 3)),
    dueDate: iso(addDays(now(), 27)).slice(0, 10),
    statusHistory: [{ from: 'Draft', to: 'Issued', at: iso(subDays(now(), 3)), actorId: stockistAcctId }],
    createdAt: iso(subDays(now(), 3)),
    updatedAt: iso(subDays(now(), 3)),
    version: 1,
  };

  const returnableDelivery: Delivery = {
    id: 'del-0102',
    deliveryNo: 'DEL-2026-0102',
    orderId: returnableOrderId,
    invoiceId: returnableInvId,
    stockistId,
    pharmacyId,
    status: 'Delivered',
    assignedTo: deliveryBoyId,
    lines: returnableLines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      qty: l.qty,
      deliveredQty: l.qty,
      batchNumber: l.batchAllocations?.[0]?.batchNumber,
      expiryDate: l.batchAllocations?.[0]?.expiryDate,
    })),
    statusHistory: [
      { from: 'Created', to: 'Assigned', at: iso(subDays(now(), 3)), actorId: stockistManagerId },
      { from: 'Assigned', to: 'OutForDelivery', at: iso(subDays(now(), 2)), actorId: deliveryBoyId },
      { from: 'OutForDelivery', to: 'Delivered', at: iso(subDays(now(), 2)), actorId: deliveryBoyId },
    ],
    createdAt: iso(subDays(now(), 3)),
    updatedAt: iso(subDays(now(), 2)),
    deliveredAt: iso(subDays(now(), 2)),
  };

  const settings: PlatformSettings = {
    id: 'platform',
    returnWindowDays: 7,
    inviteTtlDays: 7,
    verificationSlaHours: 72,
    orderSlaHours: 24,
    paymentSlaHours: 48,
    paymentProofMandatory: false,
    billAheadAllowed: false,
    roundingMode: 'nearest',
    expiryNearDays: 90,
    expiryCriticalDays: 30,
    creditNoteAutoExpire: false,
    lastPolicyRunAt: iso(now()),
  };

  // Reserve qty on batches for delivered orders (already consumed conceptually — reduce onHand)
  for (const line of [...deliveredLines, ...returnableLines]) {
    const batch = batches.find((b) => b.id === line.batchAllocations?.[0]?.batchId);
    if (batch) batch.onHand = Math.max(0, batch.onHand - line.qty);
  }

  await db.transaction('rw', db.tables, async () => {
    await db.businesses.bulkPut(businesses);
    await db.users.bulkPut(users);
    await db.verifications.bulkPut(verifications);
    await db.connections.bulkPut(connections);
    await db.catalogues.put({ id: catalogueId, stockistId, status: 'Active', updatedAt: iso(now()) });
    await db.products.bulkPut(products);
    await db.batches.bulkPut(batches);
    await db.orders.bulkPut([deliveredOrder, pendingOrder, acceptedOrder, returnableOrder]);
    await db.invoices.bulkPut([invoice, returnableInvoice]);
    await db.deliveries.bulkPut([delivery, returnableDelivery]);
    await db.payments.put(payment);
    await db.platformSettings.put(settings);
    await db.announcements.put({
      id: 'ann-1',
      title: 'Welcome to DigiSwasthya demo',
      body: 'Complete the CarePlus ↔ MedRoute settlement journey without WhatsApp or spreadsheets.',
      targetRoles: ['Pharmacy', 'Stockist', 'Platform'],
      placements: ['Pharmacy Home', 'Stockist Home', 'All Dashboards'],
      startsAt: iso(subDays(now(), 1)),
      active: true,
      createdBy: adminId,
      createdAt: iso(subDays(now(), 1)),
    });
    await db.banners.put({
      id: 'ban-1',
      text: 'Demo OTP for password reset is 123456',
      tone: 'info',
      placements: ['Auth', 'All Dashboards'],
      startsAt: iso(subDays(now(), 30)),
      active: true,
      createdBy: adminId,
      createdAt: iso(subDays(now(), 30)),
    });
    await db.supportTickets.put({
      id: 'tkt-1',
      ticketNo: 'TKT-2026-0011',
      businessId: pharmacyId,
      createdBy: pharmacyOwnerId,
      subject: 'Invoice copy for INV-2026-0501',
      category: 'Billing',
      status: 'Open',
      priority: 'Medium',
      updates: [
        { at: iso(subDays(now(), 1)), actorId: pharmacyOwnerId, body: 'Need PDF/copy of the partially paid invoice for our accountant.' },
      ],
      createdAt: iso(subDays(now(), 1)),
      updatedAt: iso(subDays(now(), 1)),
    });
    await db.pharmacyInventory.bulkPut(
      deliveredLines.map((l) => ({
        id: `pharm-inv-${l.productId}`,
        pharmacyId,
        productId: l.productId,
        productName: l.productName,
        batchNumber: l.batchAllocations?.[0]?.batchNumber,
        expiryDate: l.batchAllocations?.[0]?.expiryDate,
        onHand: l.qty,
        updatedAt: iso(subDays(now(), 11)),
      })),
    );
    await db.messageThreads.put({
      id: 'thread-1',
      participantBusinessIds: [pharmacyId, stockistId],
      participantUserIds: [pharmacyOwnerId, stockistOwnerId],
      relatedEntityType: 'Order',
      relatedEntityId: deliveredOrderId,
      lastMessageAt: iso(subDays(now(), 10)),
      createdAt: iso(subDays(now(), 13)),
    });
    await db.messages.bulkPut([
      {
        id: 'msg-1',
        threadId: 'thread-1',
        senderId: pharmacyOwnerId,
        body: 'Please prioritise morning slot for ORD-2026-0201.',
        createdAt: iso(subDays(now(), 13)),
        readBy: [pharmacyOwnerId, stockistOwnerId],
      },
      {
        id: 'msg-2',
        threadId: 'thread-1',
        senderId: stockistOwnerId,
        body: 'Noted — assigned to Amit for morning delivery.',
        createdAt: iso(subDays(now(), 12)),
        readBy: [stockistOwnerId, pharmacyOwnerId],
      },
    ]);
    await db.notifications.bulkPut([
      {
        id: 'notif-seed-1',
        userId: stockistOwnerId,
        businessId: stockistId,
        code: 'N-016',
        title: 'New order received',
        body: 'Order ORD-2026-0202 received from CarePlus Chemists.',
        status: 'Unread',
        entityType: 'Order',
        entityId: pendingOrder.id,
        createdAt: iso(subDays(now(), 1)),
      },
      {
        id: 'notif-seed-2',
        userId: pharmacyOwnerId,
        businessId: pharmacyId,
        code: 'N-027',
        title: 'Invoice issued',
        body: 'Invoice INV-2026-0501 issued for order ORD-2026-0201.',
        status: 'Read',
        entityType: 'Invoice',
        entityId: invoiceId,
        createdAt: iso(subDays(now(), 12)),
        readAt: iso(subDays(now(), 11)),
      },
      {
        id: 'notif-seed-3',
        userId: adminId,
        businessId: platformId,
        code: 'N-002',
        title: 'Verification submitted',
        body: 'Verification for GreenLeaf Pharmacy was submitted and is awaiting review.',
        status: 'Unread',
        entityType: 'Verification',
        entityId: 'ver-greenleaf',
        createdAt: iso(subDays(now(), 2)),
      },
    ]);
    await db.auditLogs.put({
      id: 'audit-seed-1',
      actorId: adminId,
      actorName: 'Priya Nair',
      businessId: platformId,
      entityType: 'Business',
      entityId: pharmacyId,
      action: 'verification.approve',
      at: iso(subDays(now(), 77)),
      reason: 'Documents verified',
    });
    await db.seedMeta.put({ id: 'meta', seedVersion: SEED_VERSION, seededAt: iso(now()) });
  });

}
