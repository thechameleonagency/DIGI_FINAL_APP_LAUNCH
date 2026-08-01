import type { Business, Product, User } from '../domain/entities/types';
import { randomSalt, hashPassword } from '../domain/utils/crypto';
import { db } from '../data/db';

export async function clearDb(): Promise<void> {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
}

export async function makeActor(partial: {
  id: string;
  businessId: string;
  role: User['role'];
  name?: string;
}): Promise<User> {
  const salt = randomSalt();
  const user: User = {
    id: partial.id,
    businessId: partial.businessId,
    name: partial.name ?? 'Test User',
    email: `${partial.id}@test.local`,
    phone: '9000000000',
    role: partial.role,
    status: 'Active',
    passwordSalt: salt,
    passwordHash: await hashPassword('Test@2026', salt),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.users.put(user);
  return user;
}

export async function makeBusiness(partial: {
  id: string;
  type: Business['type'];
  name?: string;
  ownerUserId: string;
}): Promise<Business> {
  const biz: Business = {
    id: partial.id,
    type: partial.type,
    name: partial.name ?? `${partial.type} Biz`,
    phone: '9000000000',
    email: `${partial.id}@biz.local`,
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
    address: '1 Test Road',
    accountStatus: 'Active',
    verificationStatus: 'Approved',
    ownerUserId: partial.ownerUserId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.businesses.put(biz);
  return biz;
}

export async function makeProduct(stockistId: string, id = 'prod-1'): Promise<Product> {
  const product: Product = {
    id,
    stockistId,
    catalogueId: `cat-${stockistId}`,
    name: 'Test Dolo',
    brand: 'Micro',
    sku: `SKU-${id}`,
    packSize: '10s',
    category: 'Analgesic',
    hsn: '3004',
    gstPercent: 12,
    ptr: 10,
    mrp: 15,
    moq: 1,
    pricingClass: 'Generic',
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.products.put(product);
  return product;
}
