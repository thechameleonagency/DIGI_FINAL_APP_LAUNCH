/**
 * Rich demo seed — logically sequenced lifecycles (never random).
 * Bump SEED_VERSION to force local IndexedDB wipe + reseed.
 */
import { addDays, formatISO, subDays } from 'date-fns';
import type {
  Address,
  Batch,
  Business,
  Connection,
  CreditNote,
  Delivery,
  Invoice,
  ManagedPharmacy,
  Order,
  OrderLine,
  PartnerInvite,
  Payment,
  PlatformSettings,
  Product,
  ReturnRequest,
  SupportTicket,
  User,
  Verification,
  WishlistItem,
} from '../domain/entities/types';
import { calcOrderTotals } from '../domain/calc';
import { hashPassword, randomSalt } from '../domain/utils/crypto';
import { resetCounters } from '../domain/utils/ids';
import { calcInclusiveOrderLine, priceForOfflineManagedLine, priceForPlatformPharmacy } from '../services/pricingService';
import { hydrateCounters } from './counters';
import { db } from './db';

export const SEED_VERSION = 5;

const now = () => new Date();
const iso = (d: Date) => formatISO(d);
const daysAgo = (n: number) => iso(subDays(now(), n));
const daysAhead = (n: number) => iso(addDays(now(), n));

/** Demo login directory — also rendered on the login page. */
export type DemoAccount = {
  id: string;
  label: string;
  roleGroup: 'Admin' | 'Stockist' | 'Pharmacy';
  name: string;
  businessName: string;
  email: string;
  password: string;
  role: User['role'];
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  // Platform
  { id: 'user-admin', label: 'Admin', roleGroup: 'Admin', name: 'Priya Nair', businessName: 'DigiSwasthya Ops', email: 'admin@digiswasthya.in', password: 'Admin@2026', role: 'SuperAdmin' },
  { id: 'user-support', label: 'Support', roleGroup: 'Admin', name: 'Anita Desai', businessName: 'DigiSwasthya Ops', email: 'anita.support@digiswasthya.in', password: 'Admin@2026', role: 'SupportAgent' },
  // Stockists
  { id: 'user-vikram', label: 'Stockist Owner', roleGroup: 'Stockist', name: 'Vikram Rao', businessName: 'MedRoute Distributors', email: 'vikram@medroute.in', password: 'Stockist@2026', role: 'Owner' },
  { id: 'user-suresh', label: 'Stockist Manager', roleGroup: 'Stockist', name: 'Suresh Patil', businessName: 'MedRoute Distributors', email: 'suresh@medroute.in', password: 'Stockist@2026', role: 'Manager' },
  { id: 'user-ravi', label: 'Delivery Boy', roleGroup: 'Stockist', name: 'Ravi Kamble', businessName: 'MedRoute Distributors', email: 'ravi@medroute.in', password: 'Stockist@2026', role: 'DeliveryBoy' },
  { id: 'user-meera', label: 'Stockist Owner', roleGroup: 'Stockist', name: 'Meera Shah', businessName: 'Arogya Wholesale', email: 'meera@arogyawholesale.in', password: 'Stockist@2026', role: 'Owner' },
  { id: 'user-imran', label: 'Stockist Staff', roleGroup: 'Stockist', name: 'Imran Khan', businessName: 'Arogya Wholesale', email: 'imran@arogyawholesale.in', password: 'Stockist@2026', role: 'Staff' },
  { id: 'user-ajay', label: 'Stockist Owner', roleGroup: 'Stockist', name: 'Ajay Deshmukh', businessName: 'PharmaLink Hub', email: 'ajay@pharmalink.in', password: 'Stockist@2026', role: 'Owner' },
  { id: 'user-kavita', label: 'Stockist Owner', roleGroup: 'Stockist', name: 'Kavita Joshi', businessName: 'HealthKart Distributors', email: 'kavita@healthkart.in', password: 'Stockist@2026', role: 'Owner' },
  { id: 'user-rohan', label: 'Stockist Owner', roleGroup: 'Stockist', name: 'Rohan Kulkarni', businessName: 'NovaMed Supply', email: 'rohan@novamed.in', password: 'Stockist@2026', role: 'Owner' },
  // Pharmacies
  { id: 'user-neha', label: 'Pharmacy Owner', roleGroup: 'Pharmacy', name: 'Neha Kulkarni', businessName: 'CarePlus Chemists', email: 'neha@careplus.pune.in', password: 'Pharmacy@2026', role: 'Owner' },
  { id: 'user-priya-more', label: 'Pharmacy Staff', roleGroup: 'Pharmacy', name: 'Priya More', businessName: 'CarePlus Chemists', email: 'priya@careplus.pune.in', password: 'Pharmacy@2026', role: 'Staff' },
  { id: 'user-amit', label: 'Pharmacy Owner', roleGroup: 'Pharmacy', name: 'Amit Pawar', businessName: 'CityMed Pharmacy', email: 'amit@citymed.pune.in', password: 'Pharmacy@2026', role: 'Owner' },
  { id: 'user-sunita', label: 'Pharmacy Owner', roleGroup: 'Pharmacy', name: 'Sunita Menon', businessName: 'Apollo Neighborhood', email: 'sunita@apollo.mumbai.in', password: 'Pharmacy@2026', role: 'Owner' },
  { id: 'user-deepak', label: 'Pharmacy Owner', roleGroup: 'Pharmacy', name: 'Deepak Rane', businessName: 'Wellness Point', email: 'deepak@wellness.nagpur.in', password: 'Pharmacy@2026', role: 'Owner' },
  { id: 'user-sneha', label: 'Pharmacy Owner', roleGroup: 'Pharmacy', name: 'Sneha Patil', businessName: 'GreenLeaf Chemists', email: 'sneha@greenleaf.nashik.in', password: 'Pharmacy@2026', role: 'Owner' },
];

async function makeUser(
  partial: Omit<User, 'passwordSalt' | 'passwordHash' | 'createdAt' | 'updatedAt'> & {
    password: string;
    createdAt?: string;
  },
): Promise<User> {
  const salt = randomSalt();
  const passwordHash = await hashPassword(partial.password, salt);
  const { password: _, createdAt, ...rest } = partial;
  return {
    ...rest,
    passwordSalt: salt,
    passwordHash,
    onboardingSeenAt: rest.onboardingSeenAt ?? iso(now()),
    createdAt: createdAt ?? iso(now()),
    updatedAt: iso(now()),
  };
}

async function clearAllTables(): Promise<void> {
  for (const table of db.tables) {
    try {
      await table.clear();
    } catch {
      // continue
    }
  }
}

/**
 * Skip when current seed version is present and demo accounts exist.
 * Bump SEED_VERSION to force wipe + reseed.
 */
export async function ensureSeeded(): Promise<void> {
  try {
    await db.open();
  } catch {
    // continue
  }
  const meta = await db.seedMeta.get('meta').catch(() => undefined);
  const userCount = await db.users.count().catch(() => 0);
  if (meta?.seedVersion === SEED_VERSION && userCount >= DEMO_ACCOUNTS.length) {
    const users = await db.users.toArray();
    const ts = iso(now());
    await Promise.all(
      users.filter((u) => !u.onboardingSeenAt).map((u) => db.users.update(u.id, { onboardingSeenAt: ts })),
    );
    await hydrateCounters();
    return;
  }

  await clearAllTables();
  try {
    await seedAll();
  } catch (err) {
    console.warn('Seed failed, retrying', err);
    try {
      await db.delete();
      await db.open();
    } catch {
      await clearAllTables();
    }
    await seedAll();
  }

  await hydrateCounters();
}

function addr(id: string, line1: string, city: string, state: string, pincode: string): Address {
  return { id, label: 'Storefront', line1, city, state, pincode, isDefault: true };
}

function hist(steps: { from: string; to: string; at: string; actorId: string; reason?: string }[]) {
  return steps.map((s) => ({ from: s.from, to: s.to, at: s.at, actorId: s.actorId, reason: s.reason }));
}

function lineFromProduct(
  product: Product,
  qty: number,
  settings: PlatformSettings,
  mode: 'platform' | 'offline',
): OrderLine {
  const priced =
    mode === 'offline'
      ? priceForOfflineManagedLine(product, qty, settings)
      : priceForPlatformPharmacy(product, settings);
  const money = calcInclusiveOrderLine(priced, qty, product.gstPercent);
  return {
    id: `ol-${product.id}-${qty}-${mode}`,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    packSize: product.packSize,
    qty,
    unitPrice: money.unitPrice,
    basePtr: priced.basePtr,
    commissionAmount: money.commissionAmount,
    pricingClass: priced.pricingClass,
    commissionMode: priced.commissionMode,
    mrp: product.mrp,
    gstPercent: product.gstPercent,
    lineSubtotal: money.lineSubtotal,
    lineTax: money.lineTax,
    lineTotal: money.lineTotal,
  };
}

/**
 * Seeds a complete demo world following real app lifecycles step-by-step:
 * businesses → verifications → users → catalogues → products → batches →
 * connections → managed pharmacies → invites → orders (varied stages) →
 * invoices → deliveries → payments → returns → credit notes.
 */
export async function seedAll(): Promise<void> {
  resetCounters();

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
    creditNoteExpiryDays: 90,
    genericCommissionPercent: 0.5,
    ethicalCommissionFlatPerProduct: 1,
    offlineManagedFlatPerLine: 1,
    defaultGstPercent: 12,
    lastPolicyRunAt: daysAgo(1),
  };

  // ─── IDs ───────────────────────────────────────────────
  const platformId = 'biz-platform';
  const st = {
    medroute: 'biz-medroute',
    arogya: 'biz-arogya',
    pharmalink: 'biz-pharmalink',
    healthkart: 'biz-healthkart',
    novamed: 'biz-novamed',
  } as const;
  const ph = {
    careplus: 'biz-careplus',
    citymed: 'biz-citymed',
    apollo: 'biz-apollo',
    wellness: 'biz-wellness',
    greenleaf: 'biz-greenleaf',
  } as const;

  // ─── Businesses (step 1) ───────────────────────────────
  const businesses: Business[] = [
    {
      id: platformId,
      type: 'Platform',
      name: 'DigiSwasthya Ops',
      phone: '9000000001',
      email: 'admin@digiswasthya.in',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      address: 'DigiSwasthya HQ, Senapati Bapat Road, Pune',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: 'user-admin',
      createdAt: daysAgo(120),
      updatedAt: daysAgo(1),
    },
    {
      id: st.medroute,
      type: 'Stockist',
      name: 'MedRoute Distributors',
      legalName: 'MedRoute Distributors Pvt Ltd',
      gstNumber: '27AABCM1234F1Z5',
      drugLicenseNumber: 'MH-WD-2024-8891',
      phone: '9876543210',
      email: 'vikram@medroute.in',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411037',
      address: '42 Wholesale Hub, Market Yard, Gultekdi, Pune',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: 'user-vikram',
      bankAccountNumber: '123456789012',
      bankIfsc: 'HDFC0001234',
      bankName: 'HDFC Bank',
      accountHolderName: 'MedRoute Distributors Pvt Ltd',
      upiId: 'medroute@hdfc',
      servicePins: ['411037', '411038', '411001', '411007'],
      creditDaysDefault: 30,
      plan: 'Premium',
      deliveryAddresses: [addr('addr-medroute', '42 Wholesale Hub, Market Yard', 'Pune', 'Maharashtra', '411037')],
      createdAt: daysAgo(100),
      updatedAt: daysAgo(2),
    },
    {
      id: st.arogya,
      type: 'Stockist',
      name: 'Arogya Wholesale',
      legalName: 'Arogya Wholesale LLP',
      gstNumber: '27AABCA2345G1Z6',
      drugLicenseNumber: 'MH-WD-2024-4412',
      phone: '9876543211',
      email: 'meera@arogyawholesale.in',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      address: '18 Pharma Bazaar, Masjid Bunder, Mumbai',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: 'user-meera',
      bankAccountNumber: '234567890123',
      bankIfsc: 'ICIC0002345',
      bankName: 'ICICI Bank',
      accountHolderName: 'Arogya Wholesale LLP',
      upiId: 'arogya@icici',
      servicePins: ['400001', '400002', '400003'],
      creditDaysDefault: 21,
      plan: 'Free',
      createdAt: daysAgo(95),
      updatedAt: daysAgo(5),
    },
    {
      id: st.pharmalink,
      type: 'Stockist',
      name: 'PharmaLink Hub',
      legalName: 'PharmaLink Hub Pvt Ltd',
      gstNumber: '27AABCP3456H1Z7',
      drugLicenseNumber: 'MH-WD-2023-2201',
      phone: '9876543212',
      email: 'ajay@pharmalink.in',
      city: 'Nagpur',
      state: 'Maharashtra',
      pincode: '440001',
      address: '7 Medical Complex, Sitabuldi, Nagpur',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: 'user-ajay',
      servicePins: ['440001', '440010'],
      creditDaysDefault: 30,
      plan: 'Free',
      createdAt: daysAgo(92),
      updatedAt: daysAgo(8),
    },
    {
      id: st.healthkart,
      type: 'Stockist',
      name: 'HealthKart Distributors',
      legalName: 'HealthKart Distributors',
      gstNumber: '27AABCH4567J1Z8',
      drugLicenseNumber: 'MH-WD-2024-1108',
      phone: '9876543213',
      email: 'kavita@healthkart.in',
      city: 'Nashik',
      state: 'Maharashtra',
      pincode: '422001',
      address: '22 College Road Wholesale, Nashik',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: 'user-kavita',
      servicePins: ['422001', '422002'],
      creditDaysDefault: 15,
      plan: 'Premium',
      createdAt: daysAgo(88),
      updatedAt: daysAgo(4),
    },
    {
      id: st.novamed,
      type: 'Stockist',
      name: 'NovaMed Supply',
      legalName: 'NovaMed Supply Co',
      gstNumber: '27AABCN5678K1Z9',
      drugLicenseNumber: 'MH-WD-2024-3300',
      phone: '9876543214',
      email: 'rohan@novamed.in',
      city: 'Aurangabad',
      state: 'Maharashtra',
      pincode: '431001',
      address: '9 CIDCO Pharma Park, Aurangabad',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: 'user-rohan',
      servicePins: ['431001', '431003'],
      creditDaysDefault: 30,
      plan: 'Free',
      createdAt: daysAgo(85),
      updatedAt: daysAgo(6),
    },
    {
      id: ph.careplus,
      type: 'Pharmacy',
      name: 'CarePlus Chemists',
      legalName: 'CarePlus Chemists',
      gstNumber: '27AABCC6789L1Z2',
      drugLicenseNumber: 'MH-20-21456',
      pharmacyType: 'Retail',
      phone: '9823011220',
      email: 'neha@careplus.pune.in',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411038',
      address: '18 Karve Road, Kothrud, Pune',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: 'user-neha',
      upiId: 'careplus@upi',
      plan: 'Premium',
      deliveryAddresses: [addr('addr-careplus', '18 Karve Road, Kothrud', 'Pune', 'Maharashtra', '411038')],
      createdAt: daysAgo(80),
      updatedAt: daysAgo(1),
    },
    {
      id: ph.citymed,
      type: 'Pharmacy',
      name: 'CityMed Pharmacy',
      legalName: 'CityMed Pharmacy',
      gstNumber: '27AABCY7890M1Z3',
      drugLicenseNumber: 'MH-20-33102',
      pharmacyType: 'Retail',
      phone: '9823011221',
      email: 'amit@citymed.pune.in',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      address: '5 FC Road, Shivajinagar, Pune',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: 'user-amit',
      plan: 'Free',
      deliveryAddresses: [addr('addr-citymed', '5 FC Road, Shivajinagar', 'Pune', 'Maharashtra', '411001')],
      createdAt: daysAgo(75),
      updatedAt: daysAgo(3),
    },
    {
      id: ph.apollo,
      type: 'Pharmacy',
      name: 'Apollo Neighborhood',
      legalName: 'Apollo Neighborhood Pharmacy',
      gstNumber: '27AABCA8901N1Z4',
      drugLicenseNumber: 'MH-MH-55210',
      pharmacyType: 'Retail',
      phone: '9823011222',
      email: 'sunita@apollo.mumbai.in',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
      address: '12 Linking Road, Bandra West, Mumbai',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: 'user-sunita',
      plan: 'Premium',
      deliveryAddresses: [addr('addr-apollo', '12 Linking Road, Bandra West', 'Mumbai', 'Maharashtra', '400050')],
      createdAt: daysAgo(70),
      updatedAt: daysAgo(2),
    },
    {
      id: ph.wellness,
      type: 'Pharmacy',
      name: 'Wellness Point',
      legalName: 'Wellness Point Chemists',
      gstNumber: '27AABCW9012P1Z5',
      drugLicenseNumber: 'MH-NG-44118',
      pharmacyType: 'Retail',
      phone: '9823011223',
      email: 'deepak@wellness.nagpur.in',
      city: 'Nagpur',
      state: 'Maharashtra',
      pincode: '440010',
      address: '33 Dharampeth Extension, Nagpur',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: 'user-deepak',
      plan: 'Free',
      deliveryAddresses: [addr('addr-wellness', '33 Dharampeth Extension', 'Nagpur', 'Maharashtra', '440010')],
      createdAt: daysAgo(68),
      updatedAt: daysAgo(7),
    },
    {
      id: ph.greenleaf,
      type: 'Pharmacy',
      name: 'GreenLeaf Chemists',
      legalName: 'GreenLeaf Chemists',
      gstNumber: '27AABCG0123Q1Z6',
      drugLicenseNumber: 'MH-NS-22045',
      pharmacyType: 'Retail',
      phone: '9823011224',
      email: 'sneha@greenleaf.nashik.in',
      city: 'Nashik',
      state: 'Maharashtra',
      pincode: '422001',
      address: '8 College Road, Nashik',
      accountStatus: 'Active',
      verificationStatus: 'Approved',
      ownerUserId: 'user-sneha',
      plan: 'Free',
      deliveryAddresses: [addr('addr-greenleaf', '8 College Road', 'Nashik', 'Maharashtra', '422001')],
      createdAt: daysAgo(65),
      updatedAt: daysAgo(9),
    },
  ];

  // ─── Users (step 2) — every DEMO_ACCOUNTS entry ────────
  const users: User[] = await Promise.all(
    DEMO_ACCOUNTS.map((a) =>
      makeUser({
        id: a.id,
        businessId:
          a.roleGroup === 'Admin'
            ? platformId
            : a.businessName === 'MedRoute Distributors'
              ? st.medroute
              : a.businessName === 'Arogya Wholesale'
                ? st.arogya
                : a.businessName === 'PharmaLink Hub'
                  ? st.pharmalink
                  : a.businessName === 'HealthKart Distributors'
                    ? st.healthkart
                    : a.businessName === 'NovaMed Supply'
                      ? st.novamed
                      : a.businessName === 'CarePlus Chemists'
                        ? ph.careplus
                        : a.businessName === 'CityMed Pharmacy'
                          ? ph.citymed
                          : a.businessName === 'Apollo Neighborhood'
                            ? ph.apollo
                            : a.businessName === 'Wellness Point'
                              ? ph.wellness
                              : ph.greenleaf,
        name: a.name,
        email: a.email,
        phone:
          a.id === 'user-admin'
            ? '9000000001'
            : a.id === 'user-support'
              ? '9000000002'
              : a.id === 'user-vikram'
                ? '9876543210'
                : a.id === 'user-suresh'
                  ? '9876543220'
                  : a.id === 'user-ravi'
                    ? '9876543230'
                    : a.id === 'user-meera'
                      ? '9876543211'
                      : a.id === 'user-imran'
                        ? '9876543240'
                        : a.id === 'user-ajay'
                          ? '9876543212'
                          : a.id === 'user-kavita'
                            ? '9876543213'
                            : a.id === 'user-rohan'
                              ? '9876543214'
                              : a.id === 'user-neha'
                                ? '9823011220'
                                : a.id === 'user-priya-more'
                                  ? '9823011230'
                                  : a.id === 'user-amit'
                                    ? '9823011221'
                                    : a.id === 'user-sunita'
                                      ? '9823011222'
                                      : a.id === 'user-deepak'
                                        ? '9823011223'
                                        : '9823011224',
        role: a.role,
        status: 'Active',
        password: a.password,
        createdAt: daysAgo(a.roleGroup === 'Admin' ? 120 : 90),
      }),
    ),
  );

  // ─── Verifications (step 3) — Approved for all trade businesses ──
  const tradeBiz = businesses.filter((b) => b.type !== 'Platform');
  const verifications: Verification[] = tradeBiz.map((b, i) => {
    const submitted = daysAgo(90 - i);
    const reviewed = daysAgo(89 - i);
    return {
      id: `ver-${b.id}`,
      businessId: b.id,
      status: 'Approved' as const,
      submittedAt: submitted,
      reviewedAt: reviewed,
      reviewerId: 'user-admin',
      documentIds: [],
      decisionHistory: hist([
        { from: 'NotStarted', to: 'Submitted', at: submitted, actorId: b.ownerUserId },
        { from: 'Submitted', to: 'UnderReview', at: submitted, actorId: 'user-admin' },
        { from: 'UnderReview', to: 'Approved', at: reviewed, actorId: 'user-admin' },
      ]),
      createdAt: submitted,
      updatedAt: reviewed,
    };
  });

  // ─── Catalogues (step 4) ───────────────────────────────
  const catalogues = Object.values(st).map((id) => ({
    id: `cat-${id}`,
    stockistId: id,
    status: 'Active' as const,
    updatedAt: daysAgo(60),
  }));

  // ─── Products (step 5) — catalogues before trade ───────
  const mkProd = (
    id: string,
    stockistId: string,
    data: {
      name: string;
      sku: string;
      brand: string;
      category: string;
      packSize: string;
      mrp: number;
      ptr: number;
      gstPercent: number;
      moq: number;
      pricingClass: 'Generic' | 'Ethical';
      hsn?: string;
      manufacturer?: string;
      genericName?: string;
      composition?: string;
      purchaseRate?: number;
      reorderLevel?: number;
      rxRequired?: boolean;
      maxQty?: number;
    },
  ): Product => ({
    id,
    stockistId,
    catalogueId: `cat-${stockistId}`,
    name: data.name,
    sku: data.sku,
    brand: data.brand,
    category: data.category,
    packSize: data.packSize,
    mrp: data.mrp,
    ptr: data.ptr,
    gstPercent: data.gstPercent,
    moq: data.moq,
    maxQty: data.maxQty,
    pricingClass: data.pricingClass,
    hsn: data.hsn ?? '3004',
    manufacturer: data.manufacturer,
    genericName: data.genericName,
    composition: data.composition,
    purchaseRate: data.purchaseRate ?? Math.round(data.ptr * 0.85),
    reorderLevel: data.reorderLevel ?? 20,
    rxRequired: data.rxRequired,
    status: 'Active',
    createdAt: daysAgo(58),
    updatedAt: daysAgo(10),
  });

  const products: Product[] = [
    // MedRoute — mixed Generic / Ethical
    mkProd('prod-mr-dolo', st.medroute, {
      name: 'Dolo 650 Tablet',
      sku: 'MR-DOLO-650',
      brand: 'Micro Labs',
      category: 'Analgesic',
      packSize: '15 Tab',
      mrp: 35,
      ptr: 22,
      gstPercent: 12,
      moq: 5,
      pricingClass: 'Generic',
      genericName: 'Paracetamol',
      composition: 'Paracetamol 650mg',
      manufacturer: 'Micro Labs Ltd',
    }),
    mkProd('prod-mr-augmentin', st.medroute, {
      name: 'Augmentin 625 Duo',
      sku: 'MR-AUG-625',
      brand: 'GSK',
      category: 'Antibiotic',
      packSize: '10 Tab',
      mrp: 220,
      ptr: 165,
      gstPercent: 12,
      moq: 2,
      pricingClass: 'Ethical',
      rxRequired: true,
      genericName: 'Amoxicillin + Clavulanic Acid',
      composition: 'Amoxicillin 500mg + Clavulanic Acid 125mg',
      manufacturer: 'GlaxoSmithKline',
    }),
    mkProd('prod-mr-crocin', st.medroute, {
      name: 'Crocin Advance',
      sku: 'MR-CRO-ADV',
      brand: 'GSK',
      category: 'Analgesic',
      packSize: '20 Tab',
      mrp: 45,
      ptr: 28,
      gstPercent: 12,
      moq: 5,
      pricingClass: 'Generic',
      genericName: 'Paracetamol',
      composition: 'Paracetamol 500mg',
    }),
    mkProd('prod-mr-shelcal', st.medroute, {
      name: 'Shelcal 500',
      sku: 'MR-SHEL-500',
      brand: 'Torrent',
      category: 'Supplement',
      packSize: '15 Tab',
      mrp: 140,
      ptr: 95,
      gstPercent: 12,
      moq: 3,
      pricingClass: 'Ethical',
      composition: 'Calcium Carbonate 500mg + Vitamin D3',
    }),
    mkProd('prod-mr-pantop', st.medroute, {
      name: 'Pantop 40',
      sku: 'MR-PAN-40',
      brand: 'Aristo',
      category: 'Gastro',
      packSize: '15 Tab',
      mrp: 120,
      ptr: 78,
      gstPercent: 12,
      moq: 5,
      pricingClass: 'Generic',
      genericName: 'Pantoprazole',
      composition: 'Pantoprazole 40mg',
    }),
    // Arogya
    mkProd('prod-ar-azith', st.arogya, {
      name: 'Azithromycin 500',
      sku: 'AR-AZI-500',
      brand: 'Cipla',
      category: 'Antibiotic',
      packSize: '3 Tab',
      mrp: 75,
      ptr: 48,
      gstPercent: 12,
      moq: 10,
      pricingClass: 'Generic',
      rxRequired: true,
      genericName: 'Azithromycin',
    }),
    mkProd('prod-ar-telma', st.arogya, {
      name: 'Telma 40',
      sku: 'AR-TEL-40',
      brand: 'Glenmark',
      category: 'Cardiac',
      packSize: '30 Tab',
      mrp: 280,
      ptr: 195,
      gstPercent: 12,
      moq: 2,
      pricingClass: 'Ethical',
      rxRequired: true,
      composition: 'Telmisartan 40mg',
    }),
    mkProd('prod-ar-vicks', st.arogya, {
      name: 'Vicks VapoRub 25ml',
      sku: 'AR-VICK-25',
      brand: 'P&G',
      category: 'OTC',
      packSize: '25 ml',
      mrp: 95,
      ptr: 62,
      gstPercent: 18,
      moq: 6,
      pricingClass: 'Generic',
    }),
    // PharmaLink
    mkProd('prod-pl-metformin', st.pharmalink, {
      name: 'Glycomet 500',
      sku: 'PL-GLY-500',
      brand: 'USV',
      category: 'Diabetes',
      packSize: '20 Tab',
      mrp: 45,
      ptr: 28,
      gstPercent: 12,
      moq: 10,
      pricingClass: 'Generic',
      rxRequired: true,
      genericName: 'Metformin',
    }),
    mkProd('prod-pl-atorva', st.pharmalink, {
      name: 'Atorva 10',
      sku: 'PL-ATO-10',
      brand: 'Zydus',
      category: 'Cardiac',
      packSize: '15 Tab',
      mrp: 110,
      ptr: 72,
      gstPercent: 12,
      moq: 5,
      pricingClass: 'Ethical',
      rxRequired: true,
    }),
    mkProd('prod-pl-ors', st.pharmalink, {
      name: 'Electral ORS',
      sku: 'PL-ORS-1',
      brand: 'FDC',
      category: 'OTC',
      packSize: '21.8 g',
      mrp: 25,
      ptr: 14,
      gstPercent: 12,
      moq: 20,
      pricingClass: 'Generic',
    }),
    // HealthKart
    mkProd('prod-hk-becosules', st.healthkart, {
      name: 'Becosules Capsule',
      sku: 'HK-BEC-CAP',
      brand: 'Pfizer',
      category: 'Supplement',
      packSize: '20 Cap',
      mrp: 55,
      ptr: 36,
      gstPercent: 12,
      moq: 5,
      pricingClass: 'Generic',
    }),
    mkProd('prod-hk-montair', st.healthkart, {
      name: 'Montair LC',
      sku: 'HK-MON-LC',
      brand: 'Cipla',
      category: 'Respiratory',
      packSize: '10 Tab',
      mrp: 180,
      ptr: 125,
      gstPercent: 12,
      moq: 3,
      pricingClass: 'Ethical',
      rxRequired: true,
    }),
    // NovaMed
    mkProd('prod-nm-cetirizine', st.novamed, {
      name: 'Cetirizine 10mg',
      sku: 'NM-CET-10',
      brand: 'Cipla',
      category: 'Allergy',
      packSize: '10 Tab',
      mrp: 22,
      ptr: 12,
      gstPercent: 12,
      moq: 10,
      pricingClass: 'Generic',
    }),
    mkProd('prod-nm-omeprazole', st.novamed, {
      name: 'Omez 20',
      sku: 'NM-OME-20',
      brand: 'Dr Reddy',
      category: 'Gastro',
      packSize: '15 Cap',
      mrp: 70,
      ptr: 42,
      gstPercent: 12,
      moq: 5,
      pricingClass: 'Ethical',
      rxRequired: true,
    }),
  ];

  const productById = Object.fromEntries(products.map((p) => [p.id, p]));

  // ─── Batches (step 6) — stock before allocate/fulfil ────
  const mkBatch = (
    id: string,
    productId: string,
    stockistId: string,
    batchNumber: string,
    expiryDaysAhead: number,
    onHand: number,
    reserved = 0,
  ): Batch => ({
    id,
    productId,
    stockistId,
    batchNumber,
    expiryDate: daysAhead(expiryDaysAhead).slice(0, 10),
    onHand,
    reserved,
    status: onHand - reserved <= 0 ? 'Depleted' : 'Available',
    createdAt: daysAgo(55),
    updatedAt: daysAgo(5),
  });

  const batches: Batch[] = [
    mkBatch('batch-mr-dolo-1', 'prod-mr-dolo', st.medroute, 'MR-DOLO-A1', 400, 500, 40),
    mkBatch('batch-mr-dolo-2', 'prod-mr-dolo', st.medroute, 'MR-DOLO-A2', 200, 200, 0),
    mkBatch('batch-mr-aug-1', 'prod-mr-augmentin', st.medroute, 'MR-AUG-B1', 300, 120, 10),
    mkBatch('batch-mr-cro-1', 'prod-mr-crocin', st.medroute, 'MR-CRO-C1', 350, 300, 0),
    mkBatch('batch-mr-shel-1', 'prod-mr-shelcal', st.medroute, 'MR-SHEL-D1', 280, 150, 15),
    mkBatch('batch-mr-pan-1', 'prod-mr-pantop', st.medroute, 'MR-PAN-E1', 320, 220, 0),
    mkBatch('batch-ar-azi-1', 'prod-ar-azith', st.arogya, 'AR-AZI-1', 250, 400, 20),
    mkBatch('batch-ar-tel-1', 'prod-ar-telma', st.arogya, 'AR-TEL-1', 400, 80, 5),
    mkBatch('batch-ar-vick-1', 'prod-ar-vicks', st.arogya, 'AR-VICK-1', 500, 200, 0),
    mkBatch('batch-pl-gly-1', 'prod-pl-metformin', st.pharmalink, 'PL-GLY-1', 360, 350, 0),
    mkBatch('batch-pl-ato-1', 'prod-pl-atorva', st.pharmalink, 'PL-ATO-1', 300, 100, 8),
    mkBatch('batch-pl-ors-1', 'prod-pl-ors', st.pharmalink, 'PL-ORS-1', 180, 500, 0),
    mkBatch('batch-hk-bec-1', 'prod-hk-becosules', st.healthkart, 'HK-BEC-1', 400, 180, 0),
    mkBatch('batch-hk-mon-1', 'prod-hk-montair', st.healthkart, 'HK-MON-1', 270, 90, 0),
    mkBatch('batch-nm-cet-1', 'prod-nm-cetirizine', st.novamed, 'NM-CET-1', 300, 250, 0),
    mkBatch('batch-nm-ome-1', 'prod-nm-omeprazole', st.novamed, 'NM-OME-1', 260, 110, 0),
  ];

  // ─── Connections (step 7) — after both sides Approved ──
  const mkConn = (
    id: string,
    pharmacyId: string,
    stockistId: string,
    status: Connection['status'],
    requestedDaysAgo: number,
    respondedDaysAgo?: number,
  ): Connection => {
    const requestedAt = daysAgo(requestedDaysAgo);
    const respondedAt = respondedDaysAgo != null ? daysAgo(respondedDaysAgo) : undefined;
    const steps =
      status === 'Requested'
        ? hist([{ from: 'Draft', to: 'Requested', at: requestedAt, actorId: businesses.find((b) => b.id === pharmacyId)!.ownerUserId }])
        : status === 'Active'
          ? hist([
              { from: 'Draft', to: 'Requested', at: requestedAt, actorId: businesses.find((b) => b.id === pharmacyId)!.ownerUserId },
              { from: 'Requested', to: 'Active', at: respondedAt!, actorId: businesses.find((b) => b.id === stockistId)!.ownerUserId },
            ])
          : status === 'Rejected'
            ? hist([
                { from: 'Draft', to: 'Requested', at: requestedAt, actorId: businesses.find((b) => b.id === pharmacyId)!.ownerUserId },
                {
                  from: 'Requested',
                  to: 'Rejected',
                  at: respondedAt!,
                  actorId: businesses.find((b) => b.id === stockistId)!.ownerUserId,
                  reason: 'Outside service PIN for now',
                },
              ])
            : hist([
                { from: 'Draft', to: 'Requested', at: requestedAt, actorId: businesses.find((b) => b.id === pharmacyId)!.ownerUserId },
                { from: 'Requested', to: 'Active', at: daysAgo(requestedDaysAgo - 2), actorId: businesses.find((b) => b.id === stockistId)!.ownerUserId },
                {
                  from: 'Active',
                  to: status,
                  at: respondedAt!,
                  actorId: businesses.find((b) => b.id === stockistId)!.ownerUserId,
                  reason: status === 'Blocked' ? 'Repeated payment delays' : 'Mutual disconnect',
                },
              ]);
    return {
      id,
      pharmacyId,
      stockistId,
      status,
      requestedAt,
      respondedAt,
      creditDays: 30,
      creditLimit: 150000,
      statusHistory: steps,
      createdAt: requestedAt,
      updatedAt: respondedAt ?? requestedAt,
    };
  };

  const connections: Connection[] = [
    // CarePlus fully trading with MedRoute (primary demo path)
    mkConn('conn-careplus-medroute', ph.careplus, st.medroute, 'Active', 55, 54),
    mkConn('conn-careplus-arogya', ph.careplus, st.arogya, 'Active', 50, 49),
    mkConn('conn-careplus-pharmalink', ph.careplus, st.pharmalink, 'Requested', 2),
    mkConn('conn-citymed-medroute', ph.citymed, st.medroute, 'Active', 48, 47),
    mkConn('conn-citymed-healthkart', ph.citymed, st.healthkart, 'Active', 40, 39),
    mkConn('conn-apollo-arogya', ph.apollo, st.arogya, 'Active', 45, 44),
    mkConn('conn-apollo-novamed', ph.apollo, st.novamed, 'Rejected', 20, 18),
    mkConn('conn-wellness-pharmalink', ph.wellness, st.pharmalink, 'Active', 42, 41),
    mkConn('conn-wellness-medroute', ph.wellness, st.medroute, 'Blocked', 35, 10),
    mkConn('conn-greenleaf-healthkart', ph.greenleaf, st.healthkart, 'Active', 38, 37),
    mkConn('conn-greenleaf-novamed', ph.greenleaf, st.novamed, 'Active', 30, 28),
    mkConn('conn-greenleaf-medroute', ph.greenleaf, st.medroute, 'Disconnected', 25, 12),
  ];

  // ─── Managed pharmacies (step 8) ───────────────────────
  const managed: ManagedPharmacy[] = [
    {
      id: 'mp-kothrud-local',
      stockistId: st.medroute,
      name: 'Kothrud Local Medical',
      phone: '9876500101',
      email: 'kothrud.local@example.com',
      gst: '27AABCK1111A1Z1',
      address: '11 Paud Road, Kothrud',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411038',
      creditDays: 15,
      creditLimit: 50000,
      note: 'Long-time offline retailer — WhatsApp orders',
      status: 'OfflineOnly',
      createdAt: daysAgo(40),
      updatedAt: daysAgo(3),
    },
    {
      id: 'mp-baner-care',
      stockistId: st.medroute,
      name: 'Baner Care Chemist',
      phone: '9876500102',
      email: 'baner.care@example.com',
      address: 'Baner Main Road',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411045',
      creditDays: 21,
      note: 'Invited last week — awaiting registration',
      status: 'Invited',
      inviteId: 'inv-baner-care',
      createdAt: daysAgo(20),
      updatedAt: daysAgo(7),
    },
    {
      id: 'mp-linked-citymed-crm',
      stockistId: st.arogya,
      name: 'CityMed (pre-platform CRM)',
      phone: '9823011221',
      gst: '27AABCY7890M1Z3',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      status: 'Linked',
      linkedBusinessId: ph.citymed,
      inviteId: 'inv-citymed-arogya',
      note: 'Was offline; now Linked to CityMed Pharmacy',
      createdAt: daysAgo(60),
      updatedAt: daysAgo(45),
    },
    {
      id: 'mp-andheri-rx',
      stockistId: st.arogya,
      name: 'Andheri Rx Corner',
      phone: '9876500201',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400053',
      status: 'OfflineOnly',
      creditDays: 10,
      createdAt: daysAgo(15),
      updatedAt: daysAgo(2),
    },
  ];

  // ─── Partner invites (step 9) ──────────────────────────
  const invites: PartnerInvite[] = [
    {
      id: 'inv-baner-care',
      stockistId: st.medroute,
      name: 'Baner Care Chemist',
      phone: '9876500102',
      email: 'baner.care@example.com',
      status: 'Sent',
      managedPharmacyId: 'mp-baner-care',
      createdAt: daysAgo(7),
    },
    {
      id: 'inv-citymed-arogya',
      stockistId: st.arogya,
      name: 'CityMed Pharmacy',
      phone: '9823011221',
      gst: '27AABCY7890M1Z3',
      status: 'Connected',
      managedPharmacyId: 'mp-linked-citymed-crm',
      createdAt: daysAgo(50),
    },
    {
      id: 'inv-new-hadapsar',
      stockistId: st.medroute,
      name: 'Hadapsar Health Mart',
      phone: '9876500199',
      status: 'Sent',
      createdAt: daysAgo(3),
    },
  ];

  // ─── Orders (step 10) — staged lifecycles ──────────────
  const careplusAddr = businesses.find((b) => b.id === ph.careplus)!.deliveryAddresses![0];
  const citymedAddr = businesses.find((b) => b.id === ph.citymed)!.deliveryAddresses![0];
  const apolloAddr = businesses.find((b) => b.id === ph.apollo)!.deliveryAddresses![0];
  const wellnessAddr = businesses.find((b) => b.id === ph.wellness)!.deliveryAddresses![0];
  const greenleafAddr = businesses.find((b) => b.id === ph.greenleaf)!.deliveryAddresses![0];

  const L = (productId: string, qty: number, mode: 'platform' | 'offline' = 'platform') =>
    lineFromProduct(productById[productId], qty, settings, mode);

  // Helper to stamp unique line ids per order
  const withLineIds = (orderKey: string, lines: OrderLine[]): OrderLine[] =>
    lines.map((l, i) => ({ ...l, id: `${orderKey}-L${i + 1}` }));

  // ORD-1 CarePlus↔MedRoute: Closed + Paid + Return/CN applied (full happy path finished)
  const ord1Lines = withLineIds('ord-1', [L('prod-mr-dolo', 20), L('prod-mr-augmentin', 4)]);
  const ord1Totals = calcOrderTotals(ord1Lines);
  const ord1Placed = daysAgo(28);
  const order1: Order = {
    id: 'ord-1',
    orderNo: 'ORD-2026-0001',
    pharmacyId: ph.careplus,
    stockistId: st.medroute,
    connectionId: 'conn-careplus-medroute',
    status: 'Closed',
    lines: ord1Lines.map((l) => ({
      ...l,
      acceptedQty: l.qty,
      allocatedQty: l.qty,
      packedQty: l.qty,
      deliveredQty: l.qty,
      receivedQty: l.qty,
      batchAllocations:
        l.productId === 'prod-mr-dolo'
          ? [{ batchId: 'batch-mr-dolo-1', batchNumber: 'MR-DOLO-A1', qty: l.qty, expiryDate: batches[0].expiryDate }]
          : [{ batchId: 'batch-mr-aug-1', batchNumber: 'MR-AUG-B1', qty: l.qty, expiryDate: batches[2].expiryDate }],
    })),
    ...ord1Totals,
    deliveryAddress: careplusAddr,
    source: 'Platform',
    idempotencyKey: 'seed-ord-1',
    invoiceId: 'inv-1',
    deliveryId: 'del-1',
    grnRecordedAt: daysAgo(25),
    statusHistory: hist([
      { from: 'Draft', to: 'Pending', at: ord1Placed, actorId: 'user-neha' },
      { from: 'Pending', to: 'Accepted', at: daysAgo(27), actorId: 'user-vikram' },
      { from: 'Accepted', to: 'Allocated', at: daysAgo(27), actorId: 'user-suresh' },
      { from: 'Allocated', to: 'Packed', at: daysAgo(26), actorId: 'user-suresh' },
      { from: 'Packed', to: 'Dispatched', at: daysAgo(26), actorId: 'user-vikram' },
      { from: 'Dispatched', to: 'Delivered', at: daysAgo(25), actorId: 'user-ravi' },
      { from: 'Delivered', to: 'Closed', at: daysAgo(24), actorId: 'user-neha' },
    ]),
    placedBy: 'user-neha',
    placedAt: ord1Placed,
    createdAt: ord1Placed,
    updatedAt: daysAgo(24),
    version: 7,
  };

  // ORD-2 CarePlus↔MedRoute: Delivered, invoice PartiallyPaid
  const ord2Lines = withLineIds('ord-2', [L('prod-mr-crocin', 30), L('prod-mr-pantop', 10)]);
  const ord2Totals = calcOrderTotals(ord2Lines);
  const ord2Placed = daysAgo(12);
  const order2: Order = {
    id: 'ord-2',
    orderNo: 'ORD-2026-0002',
    pharmacyId: ph.careplus,
    stockistId: st.medroute,
    connectionId: 'conn-careplus-medroute',
    status: 'Delivered',
    lines: ord2Lines.map((l) => ({
      ...l,
      acceptedQty: l.qty,
      allocatedQty: l.qty,
      packedQty: l.qty,
      deliveredQty: l.qty,
      receivedQty: l.qty,
      batchAllocations:
        l.productId === 'prod-mr-crocin'
          ? [{ batchId: 'batch-mr-cro-1', batchNumber: 'MR-CRO-C1', qty: l.qty, expiryDate: batches[3].expiryDate }]
          : [{ batchId: 'batch-mr-pan-1', batchNumber: 'MR-PAN-E1', qty: l.qty, expiryDate: batches[5].expiryDate }],
    })),
    ...ord2Totals,
    deliveryAddress: careplusAddr,
    source: 'Platform',
    idempotencyKey: 'seed-ord-2',
    invoiceId: 'inv-2',
    deliveryId: 'del-2',
    grnRecordedAt: daysAgo(9),
    statusHistory: hist([
      { from: 'Draft', to: 'Pending', at: ord2Placed, actorId: 'user-neha' },
      { from: 'Pending', to: 'Accepted', at: daysAgo(11), actorId: 'user-vikram' },
      { from: 'Accepted', to: 'Allocated', at: daysAgo(11), actorId: 'user-suresh' },
      { from: 'Allocated', to: 'Packed', at: daysAgo(10), actorId: 'user-suresh' },
      { from: 'Packed', to: 'Dispatched', at: daysAgo(10), actorId: 'user-vikram' },
      { from: 'Dispatched', to: 'Delivered', at: daysAgo(9), actorId: 'user-ravi' },
    ]),
    placedBy: 'user-neha',
    placedAt: ord2Placed,
    createdAt: ord2Placed,
    updatedAt: daysAgo(9),
    version: 6,
  };

  // ORD-3 CarePlus↔Arogya: Packed + Issued invoice, delivery Created (ready to dispatch)
  const ord3Lines = withLineIds('ord-3', [L('prod-ar-azith', 20), L('prod-ar-telma', 2)]);
  const ord3Totals = calcOrderTotals(ord3Lines);
  const ord3Placed = daysAgo(5);
  const order3: Order = {
    id: 'ord-3',
    orderNo: 'ORD-2026-0003',
    pharmacyId: ph.careplus,
    stockistId: st.arogya,
    connectionId: 'conn-careplus-arogya',
    status: 'Packed',
    lines: ord3Lines.map((l) => ({
      ...l,
      acceptedQty: l.qty,
      allocatedQty: l.qty,
      packedQty: l.qty,
      batchAllocations:
        l.productId === 'prod-ar-azith'
          ? [{ batchId: 'batch-ar-azi-1', batchNumber: 'AR-AZI-1', qty: l.qty, expiryDate: batches[6].expiryDate }]
          : [{ batchId: 'batch-ar-tel-1', batchNumber: 'AR-TEL-1', qty: l.qty, expiryDate: batches[7].expiryDate }],
    })),
    ...ord3Totals,
    deliveryAddress: careplusAddr,
    source: 'Platform',
    idempotencyKey: 'seed-ord-3',
    invoiceId: 'inv-3',
    deliveryId: 'del-3',
    statusHistory: hist([
      { from: 'Draft', to: 'Pending', at: ord3Placed, actorId: 'user-neha' },
      { from: 'Pending', to: 'Accepted', at: daysAgo(4), actorId: 'user-meera' },
      { from: 'Accepted', to: 'Allocated', at: daysAgo(4), actorId: 'user-imran' },
      { from: 'Allocated', to: 'Packed', at: daysAgo(3), actorId: 'user-imran' },
    ]),
    placedBy: 'user-neha',
    placedAt: ord3Placed,
    createdAt: ord3Placed,
    updatedAt: daysAgo(3),
    version: 4,
  };

  // ORD-4 CityMed↔MedRoute: Accepted (awaiting allocate)
  const ord4Lines = withLineIds('ord-4', [L('prod-mr-shelcal', 6), L('prod-mr-dolo', 15)]);
  const ord4Totals = calcOrderTotals(ord4Lines);
  const ord4Placed = daysAgo(2);
  const order4: Order = {
    id: 'ord-4',
    orderNo: 'ORD-2026-0004',
    pharmacyId: ph.citymed,
    stockistId: st.medroute,
    connectionId: 'conn-citymed-medroute',
    status: 'Accepted',
    lines: ord4Lines.map((l) => ({ ...l, acceptedQty: l.qty })),
    ...ord4Totals,
    deliveryAddress: citymedAddr,
    source: 'Platform',
    idempotencyKey: 'seed-ord-4',
    statusHistory: hist([
      { from: 'Draft', to: 'Pending', at: ord4Placed, actorId: 'user-amit' },
      { from: 'Pending', to: 'Accepted', at: daysAgo(1), actorId: 'user-vikram' },
    ]),
    placedBy: 'user-amit',
    placedAt: ord4Placed,
    createdAt: ord4Placed,
    updatedAt: daysAgo(1),
    version: 2,
  };

  // ORD-5 CityMed↔HealthKart: Pending (just placed)
  const ord5Lines = withLineIds('ord-5', [L('prod-hk-becosules', 10), L('prod-hk-montair', 3)]);
  const ord5Totals = calcOrderTotals(ord5Lines);
  const ord5Placed = daysAgo(0);
  const order5: Order = {
    id: 'ord-5',
    orderNo: 'ORD-2026-0005',
    pharmacyId: ph.citymed,
    stockistId: st.healthkart,
    connectionId: 'conn-citymed-healthkart',
    status: 'Pending',
    lines: ord5Lines,
    ...ord5Totals,
    deliveryAddress: citymedAddr,
    source: 'Platform',
    idempotencyKey: 'seed-ord-5',
    statusHistory: hist([{ from: 'Draft', to: 'Pending', at: ord5Placed, actorId: 'user-amit' }]),
    placedBy: 'user-amit',
    placedAt: ord5Placed,
    createdAt: ord5Placed,
    updatedAt: ord5Placed,
    version: 1,
  };

  // ORD-6 Apollo↔Arogya: Dispatched (out for delivery next)
  const ord6Lines = withLineIds('ord-6', [L('prod-ar-vicks', 12), L('prod-ar-azith', 15)]);
  const ord6Totals = calcOrderTotals(ord6Lines);
  const ord6Placed = daysAgo(8);
  const order6: Order = {
    id: 'ord-6',
    orderNo: 'ORD-2026-0006',
    pharmacyId: ph.apollo,
    stockistId: st.arogya,
    connectionId: 'conn-apollo-arogya',
    status: 'Dispatched',
    lines: ord6Lines.map((l) => ({
      ...l,
      acceptedQty: l.qty,
      allocatedQty: l.qty,
      packedQty: l.qty,
      batchAllocations:
        l.productId === 'prod-ar-vicks'
          ? [{ batchId: 'batch-ar-vick-1', batchNumber: 'AR-VICK-1', qty: l.qty, expiryDate: batches[8].expiryDate }]
          : [{ batchId: 'batch-ar-azi-1', batchNumber: 'AR-AZI-1', qty: l.qty, expiryDate: batches[6].expiryDate }],
    })),
    ...ord6Totals,
    deliveryAddress: apolloAddr,
    source: 'Platform',
    idempotencyKey: 'seed-ord-6',
    invoiceId: 'inv-4',
    deliveryId: 'del-4',
    statusHistory: hist([
      { from: 'Draft', to: 'Pending', at: ord6Placed, actorId: 'user-sunita' },
      { from: 'Pending', to: 'Accepted', at: daysAgo(7), actorId: 'user-meera' },
      { from: 'Accepted', to: 'Allocated', at: daysAgo(7), actorId: 'user-imran' },
      { from: 'Allocated', to: 'Packed', at: daysAgo(6), actorId: 'user-imran' },
      { from: 'Packed', to: 'Dispatched', at: daysAgo(1), actorId: 'user-meera' },
    ]),
    placedBy: 'user-sunita',
    placedAt: ord6Placed,
    createdAt: ord6Placed,
    updatedAt: daysAgo(1),
    version: 5,
  };

  // ORD-7 Wellness↔PharmaLink: Rejected
  const ord7Lines = withLineIds('ord-7', [L('prod-pl-atorva', 5)]);
  const ord7Totals = calcOrderTotals(ord7Lines);
  const ord7Placed = daysAgo(6);
  const order7: Order = {
    id: 'ord-7',
    orderNo: 'ORD-2026-0007',
    pharmacyId: ph.wellness,
    stockistId: st.pharmalink,
    connectionId: 'conn-wellness-pharmalink',
    status: 'Rejected',
    lines: ord7Lines,
    ...ord7Totals,
    deliveryAddress: wellnessAddr,
    source: 'Platform',
    idempotencyKey: 'seed-ord-7',
    statusHistory: hist([
      { from: 'Draft', to: 'Pending', at: ord7Placed, actorId: 'user-deepak' },
      { from: 'Pending', to: 'Rejected', at: daysAgo(5), actorId: 'user-ajay', reason: 'Stock unavailable for requested qty' },
    ]),
    placedBy: 'user-deepak',
    placedAt: ord7Placed,
    createdAt: ord7Placed,
    updatedAt: daysAgo(5),
    version: 2,
  };

  // ORD-8 GreenLeaf↔NovaMed: Cancelled by pharmacy while Pending
  const ord8Lines = withLineIds('ord-8', [L('prod-nm-cetirizine', 20)]);
  const ord8Totals = calcOrderTotals(ord8Lines);
  const ord8Placed = daysAgo(4);
  const order8: Order = {
    id: 'ord-8',
    orderNo: 'ORD-2026-0008',
    pharmacyId: ph.greenleaf,
    stockistId: st.novamed,
    connectionId: 'conn-greenleaf-novamed',
    status: 'Cancelled',
    lines: ord8Lines,
    ...ord8Totals,
    deliveryAddress: greenleafAddr,
    source: 'Platform',
    idempotencyKey: 'seed-ord-8',
    statusHistory: hist([
      { from: 'Draft', to: 'Pending', at: ord8Placed, actorId: 'user-sneha' },
      { from: 'Pending', to: 'Cancelled', at: daysAgo(3), actorId: 'user-sneha', reason: 'Duplicate order' },
    ]),
    placedBy: 'user-sneha',
    placedAt: ord8Placed,
    createdAt: ord8Placed,
    updatedAt: daysAgo(3),
    version: 2,
  };

  // ORD-9 MedRoute offline managed: Manual Accepted (offline ₹1/line)
  const ord9Lines = withLineIds('ord-9', [L('prod-mr-dolo', 10, 'offline'), L('prod-mr-crocin', 8, 'offline')]);
  const ord9Totals = calcOrderTotals(ord9Lines);
  const ord9Placed = daysAgo(6);
  const order9: Order = {
    id: 'ord-9',
    orderNo: 'ORD-2026-0009',
    pharmacyId: 'mp-kothrud-local',
    stockistId: st.medroute,
    connectionId: 'offline-mp-kothrud-local',
    managedPharmacyId: 'mp-kothrud-local',
    status: 'Accepted',
    lines: ord9Lines.map((l) => ({ ...l, acceptedQty: l.qty })),
    ...ord9Totals,
    deliveryAddress: {
      id: 'addr-mp-kothrud',
      label: 'Managed',
      line1: '11 Paud Road, Kothrud',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411038',
      isDefault: true,
    },
    source: 'Manual',
    createdByBusinessId: st.medroute,
    idempotencyKey: 'seed-ord-9',
    statusHistory: hist([
      { from: 'Draft', to: 'Pending', at: ord9Placed, actorId: 'user-vikram' },
      { from: 'Pending', to: 'Accepted', at: daysAgo(5), actorId: 'user-vikram' },
    ]),
    placedBy: 'user-vikram',
    placedAt: ord9Placed,
    createdAt: ord9Placed,
    updatedAt: daysAgo(5),
    version: 2,
  };

  // ORD-10 GreenLeaf↔HealthKart: Allocated (ready to pack)
  const ord10Lines = withLineIds('ord-10', [L('prod-hk-becosules', 15)]);
  const ord10Totals = calcOrderTotals(ord10Lines);
  const ord10Placed = daysAgo(3);
  const order10: Order = {
    id: 'ord-10',
    orderNo: 'ORD-2026-0010',
    pharmacyId: ph.greenleaf,
    stockistId: st.healthkart,
    connectionId: 'conn-greenleaf-healthkart',
    status: 'Allocated',
    lines: ord10Lines.map((l) => ({
      ...l,
      acceptedQty: l.qty,
      allocatedQty: l.qty,
      batchAllocations: [
        { batchId: 'batch-hk-bec-1', batchNumber: 'HK-BEC-1', qty: l.qty, expiryDate: batches[12].expiryDate },
      ],
    })),
    ...ord10Totals,
    deliveryAddress: greenleafAddr,
    source: 'Platform',
    idempotencyKey: 'seed-ord-10',
    statusHistory: hist([
      { from: 'Draft', to: 'Pending', at: ord10Placed, actorId: 'user-sneha' },
      { from: 'Pending', to: 'Accepted', at: daysAgo(2), actorId: 'user-kavita' },
      { from: 'Accepted', to: 'Allocated', at: daysAgo(1), actorId: 'user-kavita' },
    ]),
    placedBy: 'user-sneha',
    placedAt: ord10Placed,
    createdAt: ord10Placed,
    updatedAt: daysAgo(1),
    version: 3,
  };

  const orders: Order[] = [order1, order2, order3, order4, order5, order6, order7, order8, order9, order10];

  // ─── Invoices (step 11) — after Packed+ ────────────────
  const toInvLines = (order: Order) =>
    order.lines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      sku: l.sku,
      qty: l.packedQty ?? l.qty,
      unitPrice: l.unitPrice,
      gstPercent: l.gstPercent,
      lineSubtotal: l.lineSubtotal,
      lineTax: l.lineTax,
      lineTotal: l.lineTotal,
      batchNumber: l.batchAllocations?.[0]?.batchNumber,
      expiryDate: l.batchAllocations?.[0]?.expiryDate,
    }));

  const invoices: Invoice[] = [
    {
      id: 'inv-1',
      invoiceNo: 'INV-2026-0001',
      orderId: 'ord-1',
      stockistId: st.medroute,
      pharmacyId: ph.careplus,
      status: 'Paid',
      lines: toInvLines(order1),
      subtotal: order1.subtotal,
      taxTotal: order1.taxTotal,
      roundOff: 0,
      grandTotal: order1.grandTotal,
      outstanding: 0,
      paidAmount: order1.grandTotal - 50,
      creditApplied: 50,
      issuedAt: daysAgo(26),
      dueDate: daysAgo(26 - 30).slice(0, 10),
      statusHistory: hist([
        { from: 'Draft', to: 'Issued', at: daysAgo(26), actorId: 'user-vikram' },
        { from: 'Issued', to: 'PartiallyPaid', at: daysAgo(24), actorId: 'user-vikram' },
        { from: 'PartiallyPaid', to: 'Paid', at: daysAgo(22), actorId: 'user-vikram' },
      ]),
      createdAt: daysAgo(26),
      updatedAt: daysAgo(22),
      version: 3,
    },
    {
      id: 'inv-2',
      invoiceNo: 'INV-2026-0002',
      orderId: 'ord-2',
      stockistId: st.medroute,
      pharmacyId: ph.careplus,
      status: 'PartiallyPaid',
      lines: toInvLines(order2),
      subtotal: order2.subtotal,
      taxTotal: order2.taxTotal,
      roundOff: 0,
      grandTotal: order2.grandTotal,
      outstanding: Math.round((order2.grandTotal / 2) * 100) / 100,
      paidAmount: Math.round((order2.grandTotal / 2) * 100) / 100,
      creditApplied: 0,
      issuedAt: daysAgo(10),
      dueDate: daysAgo(10 - 30).slice(0, 10),
      statusHistory: hist([
        { from: 'Draft', to: 'Issued', at: daysAgo(10), actorId: 'user-vikram' },
        { from: 'Issued', to: 'PartiallyPaid', at: daysAgo(7), actorId: 'user-vikram' },
      ]),
      createdAt: daysAgo(10),
      updatedAt: daysAgo(7),
      version: 2,
    },
    {
      id: 'inv-3',
      invoiceNo: 'INV-2026-0003',
      orderId: 'ord-3',
      stockistId: st.arogya,
      pharmacyId: ph.careplus,
      status: 'Issued',
      lines: toInvLines(order3),
      subtotal: order3.subtotal,
      taxTotal: order3.taxTotal,
      roundOff: 0,
      grandTotal: order3.grandTotal,
      outstanding: order3.grandTotal,
      paidAmount: 0,
      creditApplied: 0,
      issuedAt: daysAgo(3),
      dueDate: daysAhead(27).slice(0, 10),
      statusHistory: hist([{ from: 'Draft', to: 'Issued', at: daysAgo(3), actorId: 'user-meera' }]),
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
      version: 1,
    },
    {
      id: 'inv-4',
      invoiceNo: 'INV-2026-0004',
      orderId: 'ord-6',
      stockistId: st.arogya,
      pharmacyId: ph.apollo,
      status: 'Overdue',
      lines: toInvLines(order6),
      subtotal: order6.subtotal,
      taxTotal: order6.taxTotal,
      roundOff: 0,
      grandTotal: order6.grandTotal,
      outstanding: order6.grandTotal,
      paidAmount: 0,
      creditApplied: 0,
      issuedAt: daysAgo(6),
      dueDate: daysAgo(2).slice(0, 10),
      statusHistory: hist([
        { from: 'Draft', to: 'Issued', at: daysAgo(6), actorId: 'user-meera' },
        { from: 'Issued', to: 'Overdue', at: daysAgo(1), actorId: 'user-admin' },
      ]),
      createdAt: daysAgo(6),
      updatedAt: daysAgo(1),
      version: 2,
    },
  ];

  // ─── Deliveries (step 12) ──────────────────────────────
  const deliveries: Delivery[] = [
    {
      id: 'del-1',
      deliveryNo: 'DEL-2026-0001',
      orderId: 'ord-1',
      invoiceId: 'inv-1',
      stockistId: st.medroute,
      pharmacyId: ph.careplus,
      status: 'Delivered',
      assignedTo: 'user-ravi',
      scheduledDate: daysAgo(25).slice(0, 10),
      lines: order1.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        qty: l.qty,
        deliveredQty: l.qty,
        batchNumber: l.batchAllocations?.[0]?.batchNumber,
        expiryDate: l.batchAllocations?.[0]?.expiryDate,
      })),
      receivedBy: 'Neha Kulkarni',
      deliveredAt: daysAgo(25),
      statusHistory: hist([
        { from: 'Draft', to: 'Created', at: daysAgo(26), actorId: 'user-vikram' },
        { from: 'Created', to: 'Assigned', at: daysAgo(26), actorId: 'user-vikram' },
        { from: 'Assigned', to: 'OutForDelivery', at: daysAgo(25), actorId: 'user-ravi' },
        { from: 'OutForDelivery', to: 'Delivered', at: daysAgo(25), actorId: 'user-ravi' },
      ]),
      createdAt: daysAgo(26),
      updatedAt: daysAgo(25),
    },
    {
      id: 'del-2',
      deliveryNo: 'DEL-2026-0002',
      orderId: 'ord-2',
      invoiceId: 'inv-2',
      stockistId: st.medroute,
      pharmacyId: ph.careplus,
      status: 'Delivered',
      assignedTo: 'user-ravi',
      scheduledDate: daysAgo(9).slice(0, 10),
      lines: order2.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        qty: l.qty,
        deliveredQty: l.qty,
        batchNumber: l.batchAllocations?.[0]?.batchNumber,
        expiryDate: l.batchAllocations?.[0]?.expiryDate,
      })),
      receivedBy: 'Priya More',
      deliveredAt: daysAgo(9),
      statusHistory: hist([
        { from: 'Draft', to: 'Created', at: daysAgo(10), actorId: 'user-vikram' },
        { from: 'Created', to: 'Assigned', at: daysAgo(10), actorId: 'user-vikram' },
        { from: 'Assigned', to: 'OutForDelivery', at: daysAgo(9), actorId: 'user-ravi' },
        { from: 'OutForDelivery', to: 'Delivered', at: daysAgo(9), actorId: 'user-ravi' },
      ]),
      createdAt: daysAgo(10),
      updatedAt: daysAgo(9),
    },
    {
      id: 'del-3',
      deliveryNo: 'DEL-2026-0003',
      orderId: 'ord-3',
      invoiceId: 'inv-3',
      stockistId: st.arogya,
      pharmacyId: ph.careplus,
      status: 'Created',
      lines: order3.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        qty: l.qty,
        deliveredQty: 0,
        batchNumber: l.batchAllocations?.[0]?.batchNumber,
        expiryDate: l.batchAllocations?.[0]?.expiryDate,
      })),
      statusHistory: hist([{ from: 'Draft', to: 'Created', at: daysAgo(3), actorId: 'user-meera' }]),
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
    },
    {
      id: 'del-4',
      deliveryNo: 'DEL-2026-0004',
      orderId: 'ord-6',
      invoiceId: 'inv-4',
      stockistId: st.arogya,
      pharmacyId: ph.apollo,
      status: 'OutForDelivery',
      assignedTo: 'user-imran',
      scheduledDate: daysAgo(0).slice(0, 10),
      lines: order6.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        qty: l.qty,
        deliveredQty: 0,
        batchNumber: l.batchAllocations?.[0]?.batchNumber,
        expiryDate: l.batchAllocations?.[0]?.expiryDate,
      })),
      statusHistory: hist([
        { from: 'Draft', to: 'Created', at: daysAgo(6), actorId: 'user-meera' },
        { from: 'Created', to: 'Assigned', at: daysAgo(1), actorId: 'user-meera' },
        { from: 'Assigned', to: 'OutForDelivery', at: daysAgo(0), actorId: 'user-imran' },
      ]),
      createdAt: daysAgo(6),
      updatedAt: daysAgo(0),
    },
  ];

  // ─── Payments (step 13) — after invoices Issued ────────
  const payments: Payment[] = [
    {
      id: 'pay-1',
      paymentNo: 'PAY-2026-0001',
      pharmacyId: ph.careplus,
      stockistId: st.medroute,
      status: 'Approved',
      amount: order1.grandTotal - 50,
      method: 'UPI',
      reference: 'UTR-CARE-001',
      allocations: [{ invoiceId: 'inv-1', invoiceNo: 'INV-2026-0001', amount: order1.grandTotal - 50 }],
      submittedBy: 'user-neha',
      submittedAt: daysAgo(24),
      reviewedBy: 'user-vikram',
      reviewedAt: daysAgo(24),
      recordedBy: 'Pharmacy',
      idempotencyKey: 'seed-pay-1',
      statusHistory: hist([
        { from: 'Draft', to: 'Submitted', at: daysAgo(24), actorId: 'user-neha' },
        { from: 'Submitted', to: 'UnderReview', at: daysAgo(24), actorId: 'user-vikram' },
        { from: 'UnderReview', to: 'Approved', at: daysAgo(24), actorId: 'user-vikram' },
      ]),
      createdAt: daysAgo(24),
      updatedAt: daysAgo(24),
    },
    {
      id: 'pay-2',
      paymentNo: 'PAY-2026-0002',
      pharmacyId: ph.careplus,
      stockistId: st.medroute,
      status: 'Approved',
      amount: Math.round((order2.grandTotal / 2) * 100) / 100,
      method: 'NEFT',
      reference: 'NEFT-CARE-002',
      allocations: [
        {
          invoiceId: 'inv-2',
          invoiceNo: 'INV-2026-0002',
          amount: Math.round((order2.grandTotal / 2) * 100) / 100,
        },
      ],
      submittedBy: 'user-neha',
      submittedAt: daysAgo(7),
      reviewedBy: 'user-vikram',
      reviewedAt: daysAgo(7),
      recordedBy: 'Pharmacy',
      idempotencyKey: 'seed-pay-2',
      statusHistory: hist([
        { from: 'Draft', to: 'Submitted', at: daysAgo(7), actorId: 'user-neha' },
        { from: 'Submitted', to: 'Approved', at: daysAgo(7), actorId: 'user-vikram' },
      ]),
      createdAt: daysAgo(7),
      updatedAt: daysAgo(7),
    },
    {
      id: 'pay-3',
      paymentNo: 'PAY-2026-0003',
      pharmacyId: ph.careplus,
      stockistId: st.arogya,
      status: 'Submitted',
      amount: Math.round((order3.grandTotal / 3) * 100) / 100,
      method: 'UPI',
      reference: 'UTR-CARE-ARO-1',
      allocations: [
        {
          invoiceId: 'inv-3',
          invoiceNo: 'INV-2026-0003',
          amount: Math.round((order3.grandTotal / 3) * 100) / 100,
        },
      ],
      submittedBy: 'user-neha',
      submittedAt: daysAgo(1),
      recordedBy: 'Pharmacy',
      idempotencyKey: 'seed-pay-3',
      statusHistory: hist([{ from: 'Draft', to: 'Submitted', at: daysAgo(1), actorId: 'user-neha' }]),
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
    {
      id: 'pay-4',
      paymentNo: 'PAY-2026-0004',
      pharmacyId: ph.apollo,
      stockistId: st.arogya,
      status: 'Rejected',
      amount: 500,
      method: 'Cheque',
      reference: 'CHQ-9911',
      allocations: [{ invoiceId: 'inv-4', invoiceNo: 'INV-2026-0004', amount: 500 }],
      notes: 'Cheque number unclear',
      rejectReason: 'Unclear cheque image / reference mismatch',
      submittedBy: 'user-sunita',
      submittedAt: daysAgo(3),
      reviewedBy: 'user-meera',
      reviewedAt: daysAgo(2),
      recordedBy: 'Pharmacy',
      idempotencyKey: 'seed-pay-4',
      statusHistory: hist([
        { from: 'Draft', to: 'Submitted', at: daysAgo(3), actorId: 'user-sunita' },
        { from: 'Submitted', to: 'Rejected', at: daysAgo(2), actorId: 'user-meera', reason: 'Unclear cheque image / reference mismatch' },
      ]),
      createdAt: daysAgo(3),
      updatedAt: daysAgo(2),
    },
    {
      id: 'pay-5',
      paymentNo: 'PAY-2026-0005',
      pharmacyId: 'mp-kothrud-local',
      stockistId: st.medroute,
      status: 'Approved',
      amount: 2500,
      method: 'Cash',
      reference: 'OFFLINE-CASH-01',
      allocations: [],
      notes: 'Cash collected against offline ledger',
      submittedBy: 'user-vikram',
      submittedAt: daysAgo(4),
      reviewedBy: 'user-vikram',
      reviewedAt: daysAgo(4),
      recordedBy: 'Stockist',
      idempotencyKey: 'seed-pay-5',
      statusHistory: hist([
        { from: 'Draft', to: 'Submitted', at: daysAgo(4), actorId: 'user-vikram' },
        { from: 'Submitted', to: 'Approved', at: daysAgo(4), actorId: 'user-vikram' },
      ]),
      createdAt: daysAgo(4),
      updatedAt: daysAgo(4),
    },
  ];

  // ─── Returns + Credit notes (step 14) — after Delivered ─
  const returns: ReturnRequest[] = [
    {
      id: 'ret-1',
      returnNo: 'RET-2026-0001',
      pharmacyId: ph.careplus,
      stockistId: st.medroute,
      orderId: 'ord-1',
      status: 'Closed',
      lines: [
        {
          productId: 'prod-mr-dolo',
          productName: 'Dolo 650 Tablet',
          qty: 2,
          approvedQty: 2,
          unitPrice: ord1Lines[0].unitPrice,
          reason: 'Damaged',
          batchNumber: 'MR-DOLO-A1',
          deliveryId: 'del-1',
          invoiceId: 'inv-1',
        },
      ],
      evidenceFileIds: [],
      disposition: 'Restock',
      creditNoteId: 'cn-1',
      submittedBy: 'user-neha',
      statusHistory: hist([
        { from: 'Draft', to: 'Submitted', at: daysAgo(23), actorId: 'user-neha' },
        { from: 'Submitted', to: 'UnderReview', at: daysAgo(23), actorId: 'user-vikram' },
        { from: 'UnderReview', to: 'Approved', at: daysAgo(22), actorId: 'user-vikram' },
        { from: 'Approved', to: 'GoodsReceived', at: daysAgo(22), actorId: 'user-suresh' },
        { from: 'GoodsReceived', to: 'Closed', at: daysAgo(22), actorId: 'user-vikram' },
      ]),
      createdAt: daysAgo(23),
      updatedAt: daysAgo(22),
    },
  ];

  const creditNotes: CreditNote[] = [
    {
      id: 'cn-1',
      creditNoteNo: 'CN-2026-0001',
      returnId: 'ret-1',
      stockistId: st.medroute,
      pharmacyId: ph.careplus,
      status: 'FullyApplied',
      amount: 50,
      remaining: 0,
      applications: [
        {
          invoiceId: 'inv-1',
          invoiceNo: 'INV-2026-0001',
          amount: 50,
          at: daysAgo(22),
          actorId: 'user-vikram',
        },
      ],
      source: 'Return',
      reason: 'Damaged Dolo return',
      issuedAt: daysAgo(22),
      issuedBy: 'user-vikram',
      createdAt: daysAgo(22),
      updatedAt: daysAgo(22),
    },
  ];

  // ─── Wishlists + a support ticket (supporting data) ────
  const wishlists: WishlistItem[] = [
    {
      id: 'wish-1',
      pharmacyId: ph.careplus,
      productId: 'prod-mr-shelcal',
      stockistId: st.medroute,
      addedAt: daysAgo(4),
    },
    {
      id: 'wish-2',
      pharmacyId: ph.citymed,
      productId: 'prod-hk-montair',
      stockistId: st.healthkart,
      addedAt: daysAgo(2),
    },
  ];

  const tickets: SupportTicket[] = [
    {
      id: 'tkt-1',
      ticketNo: 'TKT-2026-0001',
      businessId: ph.careplus,
      createdBy: 'user-neha',
      assigneeId: 'user-support',
      subject: 'Invoice INV-2026-0002 partial payment clarification',
      category: 'Payments',
      status: 'InProgress',
      priority: 'Medium',
      relatedEntityType: 'Invoice',
      relatedEntityId: 'inv-2',
      updates: [
        { at: daysAgo(2), actorId: 'user-neha', body: 'We paid half — when is the rest due?' },
        { at: daysAgo(1), actorId: 'user-support', body: 'Checking with MedRoute; due date remains as on invoice.', status: 'InProgress' },
      ],
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1),
    },
  ];

  // ─── Persist in dependency order ───────────────────────
  await db.transaction('rw', db.tables, async () => {
    await db.platformSettings.put(settings);
    await db.businesses.bulkPut(businesses);
    await db.users.bulkPut(users);
    await db.verifications.bulkPut(verifications);
    await db.catalogues.bulkPut(catalogues);
    await db.products.bulkPut(products);
    await db.batches.bulkPut(batches);
    await db.connections.bulkPut(connections);
    await db.managedPharmacies.bulkPut(managed);
    await db.partnerInvites.bulkPut(invites);
    await db.orders.bulkPut(orders);
    await db.invoices.bulkPut(invoices);
    await db.deliveries.bulkPut(deliveries);
    await db.payments.bulkPut(payments);
    await db.returns.bulkPut(returns);
    await db.creditNotes.bulkPut(creditNotes);
    await db.wishlists.bulkPut(wishlists);
    await db.supportTickets.bulkPut(tickets);
    await db.seedMeta.put({ id: 'meta', seedVersion: SEED_VERSION, seededAt: iso(now()) });
  });
}
