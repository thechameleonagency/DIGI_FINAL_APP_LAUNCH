import type {
  BatchStatus,
  ConnectionStatus,
  CreditNoteStatus,
  DeliveryStatus,
  InvoiceStatus,
  OrderStatus,
  PaymentStatus,
  ReturnStatus,
  TicketStatus,
  VerificationStatus,
} from '../entities/types';

export interface TransitionResult {
  ok: boolean;
  reason?: string;
}

function allow(map: Record<string, string[]>, from: string, to: string): TransitionResult {
  const allowed = map[from] ?? [];
  if (allowed.includes(to)) return { ok: true };
  return { ok: false, reason: `Cannot transition from ${from} to ${to}.` };
}

const verification: Record<VerificationStatus, VerificationStatus[]> = {
  NotStarted: ['Submitted'],
  Submitted: ['UnderReview', 'Rejected'],
  UnderReview: ['Approved', 'Rejected', 'DocumentsRequested'],
  DocumentsRequested: ['Submitted', 'Rejected'],
  Approved: [],
  Rejected: ['Submitted'],
};

const connection: Record<ConnectionStatus, ConnectionStatus[]> = {
  Requested: ['Active', 'Rejected', 'Cancelled'],
  Active: ['Disconnected', 'Blocked'],
  Rejected: ['Requested'],
  Disconnected: ['Requested', 'Blocked'],
  Blocked: [],
  Cancelled: ['Requested'],
};

const order: Record<OrderStatus, OrderStatus[]> = {
  Draft: ['Pending', 'Cancelled'],
  Pending: ['Accepted', 'PartiallyAccepted', 'Rejected', 'Cancelled'],
  Accepted: ['Allocated', 'Cancelled', 'Packed'],
  PartiallyAccepted: ['Allocated', 'Cancelled', 'Packed'],
  Rejected: [],
  Cancelled: [],
  Allocated: ['Packed', 'Cancelled'],
  Packed: ['Dispatched'],
  Dispatched: ['Delivered', 'PartiallyDelivered'],
  PartiallyDelivered: ['Delivered', 'Closed'],
  Delivered: ['Closed'],
  Closed: [],
};

const delivery: Record<DeliveryStatus, DeliveryStatus[]> = {
  Created: ['Assigned', 'Cancelled'],
  Assigned: ['OutForDelivery', 'Cancelled'],
  OutForDelivery: ['Delivered', 'PartiallyDelivered', 'Failed'],
  Delivered: [],
  PartiallyDelivered: ['OutForDelivery', 'Delivered'],
  Failed: ['Assigned', 'OutForDelivery', 'Cancelled'],
  Cancelled: [],
};

const invoice: Record<InvoiceStatus, InvoiceStatus[]> = {
  Draft: ['Issued', 'Void'],
  Issued: ['PartiallyPaid', 'Paid', 'Overdue', 'Void'],
  PartiallyPaid: ['Paid', 'Overdue'],
  Paid: [],
  Overdue: ['PartiallyPaid', 'Paid', 'Void'],
  Void: [],
};

const payment: Record<PaymentStatus, PaymentStatus[]> = {
  Draft: ['Submitted', 'Cancelled'],
  Submitted: ['UnderReview', 'Approved', 'Rejected', 'OnHold'],
  UnderReview: ['Approved', 'Rejected', 'OnHold'],
  Approved: [],
  Rejected: [],
  OnHold: ['UnderReview', 'Approved', 'Rejected'],
  Cancelled: [],
};

const returnMachine: Record<ReturnStatus, ReturnStatus[]> = {
  Draft: ['Submitted', 'Cancelled'],
  Submitted: ['UnderReview', 'Rejected', 'Cancelled'],
  UnderReview: ['Approved', 'PartiallyApproved', 'Rejected'],
  Approved: ['GoodsReceived', 'Closed'],
  PartiallyApproved: ['GoodsReceived', 'Closed'],
  Rejected: [],
  GoodsReceived: ['Closed'],
  Closed: [],
  Cancelled: [],
};

const creditNote: Record<CreditNoteStatus, CreditNoteStatus[]> = {
  Issued: ['PartiallyApplied', 'FullyApplied', 'Void'],
  PartiallyApplied: ['FullyApplied', 'Void'],
  FullyApplied: [],
  Void: [],
};

const ticket: Record<TicketStatus, TicketStatus[]> = {
  Open: ['InProgress', 'Closed'],
  InProgress: ['WaitingOnUser', 'Resolved', 'Closed'],
  WaitingOnUser: ['InProgress', 'Resolved', 'Closed'],
  Resolved: ['Closed', 'Reopened'],
  Closed: ['Reopened'],
  Reopened: ['InProgress', 'Resolved', 'Closed'],
};

const batch: Record<BatchStatus, BatchStatus[]> = {
  Available: ['Quarantined', 'Recalled', 'Expired', 'Depleted'],
  Quarantined: ['Available', 'Recalled', 'Expired'],
  Recalled: [],
  Expired: [],
  Depleted: [],
};

export const machines = {
  verification: (from: VerificationStatus, to: VerificationStatus) => allow(verification, from, to),
  connection: (from: ConnectionStatus, to: ConnectionStatus) => allow(connection, from, to),
  order: (from: OrderStatus, to: OrderStatus) => allow(order, from, to),
  delivery: (from: DeliveryStatus, to: DeliveryStatus) => allow(delivery, from, to),
  invoice: (from: InvoiceStatus, to: InvoiceStatus) => allow(invoice, from, to),
  payment: (from: PaymentStatus, to: PaymentStatus) => allow(payment, from, to),
  return: (from: ReturnStatus, to: ReturnStatus) => allow(returnMachine, from, to),
  creditNote: (from: CreditNoteStatus, to: CreditNoteStatus) => allow(creditNote, from, to),
  ticket: (from: TicketStatus, to: TicketStatus) => allow(ticket, from, to),
  batch: (from: BatchStatus, to: BatchStatus) => allow(batch, from, to),
};

export function canTransition(
  machine: keyof typeof machines,
  from: string,
  to: string,
): TransitionResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (machines[machine] as any)(from, to);
}
