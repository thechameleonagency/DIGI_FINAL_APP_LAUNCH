/** Static Help Center copy (CF-27). Versioned with the app — not business advice. */

export type HelpAudience = 'pharmacy' | 'stockist' | 'admin';

export type FaqItem = { q: string; a: string; audiences: HelpAudience[] };
export type GuideItem = { title: string; steps: string[]; audiences: HelpAudience[] };

export const HELP_CONTACT = {
  name: 'DigiSwasthya Platform Support',
  email: 'support@digiswasthya.in',
  hours: 'Mon–Sat, 10:00–18:00 IST',
  note: 'Use in-app Support tickets for account-specific issues. This Help content is general platform guidance only.',
};

export const HELP_FAQS: FaqItem[] = [
  {
    q: 'Is DigiSwasthya a payment gateway?',
    a: 'No. Payments are recorded with references and optional proof, then approved by the counterparty. Invoices and payments remain the financial source of truth.',
    audiences: ['pharmacy', 'stockist', 'admin'],
  },
  {
    q: 'Why can’t I see prices or place orders?',
    a: 'Your business must be verified (Approved) and you need an Active connection with the stockist. Unverified or suspended accounts cannot trade.',
    audiences: ['pharmacy', 'stockist'],
  },
  {
    q: 'Where is my data stored?',
    a: 'This build stores workspace data locally in your browser (IndexedDB). Use Settings → workspace export/import to back up or move data.',
    audiences: ['pharmacy', 'stockist', 'admin'],
  },
  {
    q: 'What does Premium unlock?',
    a: 'Premium is a convenience plan (saved report presets and a badge). It never changes trade rules, pricing, or financial documents.',
    audiences: ['pharmacy', 'stockist'],
  },
  {
    q: 'How do returns and credit notes work?',
    a: 'Pharmacies raise returns within the return window. Stockists approve quantities; credit notes can then be issued and applied to invoices.',
    audiences: ['pharmacy', 'stockist'],
  },
  {
    q: 'How do I invite staff?',
    a: 'Owners and Managers use Staff to invite by phone/email with a role. Invitees accept via the invite link and set a password.',
    audiences: ['pharmacy', 'stockist'],
  },
  {
    q: 'What should I do if a batch looks counterfeit?',
    a: 'File a Counterfeit report with product/batch details and evidence. Platform Admin investigates and may issue a batch recall.',
    audiences: ['pharmacy', 'stockist', 'admin'],
  },
  {
    q: 'How does verification work?',
    a: 'New businesses submit documents. Platform Admin reviews, may request changes, then Approves or Rejects. Trade starts only after Approval.',
    audiences: ['admin', 'pharmacy', 'stockist'],
  },
  {
    q: 'Can support change my orders or payments?',
    a: 'Platform Support can view a workspace in read-only mode (SuperAdmin view-as). They cannot mutate trade or financial documents while viewing.',
    audiences: ['pharmacy', 'stockist', 'admin'],
  },
];

export const HELP_GUIDES: GuideItem[] = [
  {
    title: 'Connect with a stockist',
    audiences: ['pharmacy'],
    steps: [
      'Open Connections or Buy and find an approved stockist.',
      'Send a connection request (credit terms may be set on approval).',
      'Wait for the stockist to Accept — then catalogue prices become visible.',
    ],
  },
  {
    title: 'Place and receive an order',
    audiences: ['pharmacy'],
    steps: [
      'Add products to cart from Buy / Smart Order / Quick Order.',
      'Place the order and track status on Orders.',
      'When goods arrive, record GRN (goods received) on the order.',
    ],
  },
  {
    title: 'Pay an invoice',
    audiences: ['pharmacy'],
    steps: [
      'Open Payments or Invoices and select outstanding bills.',
      'Submit amount, method, UTR/reference, and optional proof.',
      'Stockist reviews and Approves; outstanding updates from the documents.',
    ],
  },
  {
    title: 'Fulfil an order',
    audiences: ['stockist'],
    steps: [
      'Accept the order (or partially accept lines).',
      'Allocate batches (FEFO), pack, then issue the invoice.',
      'Assign delivery, mark out for delivery, then Delivered with POD if required.',
    ],
  },
  {
    title: 'Collect payment',
    audiences: ['stockist'],
    steps: [
      'Open Payments to review Submitted proofs.',
      'Approve, reject, or hold with a reason.',
      'Optionally record an offline payment received outside the portal.',
    ],
  },
  {
    title: 'Keep catalogue & stock healthy',
    audiences: ['stockist'],
    steps: [
      'Add or import products; keep the catalogue Active.',
      'Receive batches into inventory with expiry dates.',
      'Use Expiry and low-stock views before allocating orders.',
    ],
  },
  {
    title: 'Verify a business',
    audiences: ['admin'],
    steps: [
      'Open Verifications and select a Submitted application.',
      'Review documents; request changes or decide Approve/Reject with a reason.',
      'Approved businesses can form connections and trade.',
    ],
  },
  {
    title: 'Govern & support',
    audiences: ['admin'],
    steps: [
      'Use Network detail for suspend/reactivate and view-as (SuperAdmin).',
      'Work Support tickets and publish announcements/banners.',
      'Export Reports and Audit when you need evidence packs.',
    ],
  },
];

export function faqsFor(audience: HelpAudience): FaqItem[] {
  return HELP_FAQS.filter((f) => f.audiences.includes(audience));
}

export function guidesFor(audience: HelpAudience): GuideItem[] {
  return HELP_GUIDES.filter((g) => g.audiences.includes(audience));
}

export const REPLAY_WALKTHROUGH_EVENT = 'ds:replay-walkthrough';

export function requestWalkthroughReplay(): void {
  window.dispatchEvent(new CustomEvent(REPLAY_WALKTHROUGH_EVENT));
}
