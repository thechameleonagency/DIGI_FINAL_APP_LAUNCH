import type { Action } from '../permissions';

const ACTION_LABELS: Partial<Record<Action, string>> = {
  'order.place': 'Place orders',
  'order.accept': 'Accept orders',
  'order.allocate': 'Allocate stock',
  'order.pack': 'Pack orders',
  'order.recordManual': 'Record manual orders',
  'order.cancel': 'Cancel orders',
  'order.reject': 'Reject orders',
  'invoice.issue': 'Issue invoices',
  'payment.submit': 'Submit payments',
  'payment.approve': 'Approve payments',
  'payment.reject': 'Reject payments',
  'return.raise': 'Raise returns',
  'return.approve': 'Approve returns',
  'credit.apply': 'Apply credit notes',
  'credit.issue': 'Issue credit notes',
  'inventory.adjust': 'Adjust inventory',
  'connection.request': 'Request connections',
  'connection.respond': 'Respond to connections',
  'catalogue.manage': 'Manage catalogue',
  'delivery.assign': 'Assign deliveries',
  'delivery.update': 'Update deliveries',
  'staff.manage': 'Manage staff',
  'support.manage': 'Manage support',
  'verification.review': 'Review verifications',
  'business.suspend': 'Suspend businesses',
  'announcement.manage': 'Manage announcements',
  'audit.export': 'Export audit',
  'counterfeit.review': 'Review counterfeit reports',
};

const CATEGORY_LABELS: Record<string, string> = {
  Order: 'Orders',
  Payment: 'Payments',
  Invoice: 'Invoices',
  Return: 'Returns',
  Connection: 'Connections',
  Delivery: 'Deliveries',
  SupportTicket: 'Support tickets',
  Announcement: 'Announcements',
  System: 'System',
  UpgradeRequest: 'Upgrade requests',
  CounterfeitReport: 'Counterfeit reports',
  Batch: 'Batches',
  Verification: 'Verification',
  Security: 'Security',
};

const ENTITY_LABELS: Record<string, string> = {
  SupportTicket: 'Support ticket',
  UpgradeRequest: 'Upgrade request',
  Order: 'Order',
  Invoice: 'Invoice',
  Payment: 'Payment',
  Return: 'Return',
  Connection: 'Connection',
  Delivery: 'Delivery',
  Business: 'Business',
  Product: 'Product',
  Batch: 'Batch',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action as Action] ?? action.replace(/\./g, ' · ');
}

export function notificationCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function entityTypeLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType.replace(/([a-z])([A-Z])/g, '$1 $2');
}

const CATALOGUE_FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  sku: 'SKU',
  brand: 'Brand',
  category: 'Category',
  packSize: 'Pack size',
  hsn: 'HSN',
  manufacturer: 'Manufacturer',
  genericName: 'Generic name',
  composition: 'Composition',
};

export function catalogueFieldLabel(key: string): string {
  return CATALOGUE_FIELD_LABELS[key] ?? key;
}
