/** Shared demo password for all seeded cast accounts (login still required). */
export const DEMO_PASSWORD = 'Demo@1234';

export type CastPerson = {
  name: string;
  email: string;
  phone: string;
};

export type CastBizSite = {
  businessName: string;
  drugLicenseNumber: string;
  city: string;
  state: string;
  pincode: string;
  address: string;
  pharmacyType?: string;
  servicePins?: string[];
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankName?: string;
  accountHolderName?: string;
  upiId?: string;
};

export type CastTrader = {
  owner: CastPerson;
  delivery: CastPerson;
  site: CastBizSite;
};

/** Platform + trader cast for world seed. Phones 9xxxxxxxxx, emails @digiswasthya.demo. */
export const CAST = {
  superAdmin: {
    name: 'Demo Super Admin',
    email: 'superadmin@digiswasthya.demo',
    phone: '9000000001',
  } satisfies CastPerson,
  supportManager: {
    name: 'Demo Support Manager',
    email: 'support@digiswasthya.demo',
    phone: '9000000002',
  } satisfies CastPerson,

  stockistA: {
    owner: {
      name: 'Aarav Mehta',
      email: 'stockist.a.owner@digiswasthya.demo',
      phone: '9100000001',
    },
    delivery: {
      name: 'Rohan Kulkarni',
      email: 'stockist.a.delivery@digiswasthya.demo',
      phone: '9100000011',
    },
    site: {
      businessName: 'Mehta Distributors Mumbai',
      drugLicenseNumber: 'MH-WD-MUM-10001',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      address: '12 Wholesale Market, Masjid Bunder',
      servicePins: ['400001', '400002', '400003', '400004'],
      bankAccountNumber: '50100123456789',
      bankIfsc: 'HDFC0001234',
      bankName: 'HDFC Bank',
      accountHolderName: 'Mehta Distributors Mumbai',
      upiId: 'mehtadist@hdfcbank',
    },
  } satisfies CastTrader,

  stockistB: {
    owner: {
      name: 'Priya Deshmukh',
      email: 'stockist.b.owner@digiswasthya.demo',
      phone: '9100000002',
    },
    delivery: {
      name: 'Suresh Patil',
      email: 'stockist.b.delivery@digiswasthya.demo',
      phone: '9100000012',
    },
    site: {
      businessName: 'Deshmukh Pharma Pune',
      drugLicenseNumber: 'MH-WD-PUN-20002',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      address: '88 Laxmi Road, Budhwar Peth',
      servicePins: ['411001', '411002', '411005', '411014'],
      bankAccountNumber: '123456789012',
      bankIfsc: 'ICIC0000456',
      bankName: 'ICICI Bank',
      accountHolderName: 'Deshmukh Pharma Pune',
      upiId: 'deshmukh@icici',
    },
  } satisfies CastTrader,

  pharmacyA: {
    owner: {
      name: 'Neha Sharma',
      email: 'pharmacy.a.owner@digiswasthya.demo',
      phone: '9200000001',
    },
    delivery: {
      name: 'Amit Joshi',
      email: 'pharmacy.a.delivery@digiswasthya.demo',
      phone: '9200000011',
    },
    site: {
      businessName: 'Sharma Medicals Mumbai',
      drugLicenseNumber: 'MH-RT-MUM-30001',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
      address: '45 Linking Road, Bandra West',
      pharmacyType: 'Retail',
    },
  } satisfies CastTrader,

  pharmacyB: {
    owner: {
      name: 'Vikram Rao',
      email: 'pharmacy.b.owner@digiswasthya.demo',
      phone: '9200000002',
    },
    delivery: {
      name: 'Deepak Nair',
      email: 'pharmacy.b.delivery@digiswasthya.demo',
      phone: '9200000012',
    },
    site: {
      businessName: 'Rao Chemists Pune',
      drugLicenseNumber: 'MH-RT-PUN-30002',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411004',
      address: '17 FC Road, Deccan Gymkhana',
      pharmacyType: 'Retail',
    },
  } satisfies CastTrader,

  pharmacyC: {
    owner: {
      name: 'Anjali Kulkarni',
      email: 'pharmacy.c.owner@digiswasthya.demo',
      phone: '9200000003',
    },
    delivery: {
      name: 'Imran Shaikh',
      email: 'pharmacy.c.delivery@digiswasthya.demo',
      phone: '9200000013',
    },
    site: {
      businessName: 'Kulkarni Medical Nashik',
      drugLicenseNumber: 'MH-RT-NSK-30003',
      city: 'Nashik',
      state: 'Maharashtra',
      pincode: '422001',
      address: '9 College Road, Nashik',
      pharmacyType: 'Retail',
    },
  } satisfies CastTrader,

  pharmacyPending: {
    owner: {
      name: 'Sanjay Gupta',
      email: 'pharmacy.pending.owner@digiswasthya.demo',
      phone: '9200000009',
    },
    delivery: {
      name: 'Pending Delivery',
      email: 'pharmacy.pending.delivery@digiswasthya.demo',
      phone: '9200000019',
    },
    site: {
      businessName: 'Gupta Medico Pending',
      drugLicenseNumber: 'MH-RT-MUM-39999',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400070',
      address: '3 Sion Circle (awaiting activation)',
      pharmacyType: 'Retail',
    },
  } satisfies CastTrader,

  managedOffline: {
    name: 'Offline Corner Chemist',
    phone: '9300000001',
    email: 'managed.offline@digiswasthya.demo',
    gst: '27AACPH1234A1ZB',
    drugLicense: 'MH-RT-MUM-OFF-01',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400008',
    address: 'Offline lane, Dongri',
  },

  managedInvite: {
    name: 'Invite-First Medicos',
    phone: '9300000002',
    email: 'managed.invite@digiswasthya.demo',
    gst: '27AACPM9876A1ZC',
    drugLicense: 'MH-RT-PUN-INV-01',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411007',
    address: 'Invite lane, Aundh',
  },
} as const;

/**
 * Valid 15-char GSTINs (format checked by isGstin — no checksum required).
 * Unique across seeded businesses.
 */
export const CAST_GST = {
  stockistA: '27AABCU9603R1ZM',
  stockistB: '27AABCU9603R2ZN',
  pharmacyA: '27AADFP1234A1Z5',
  pharmacyB: '27AADFP1234B1Z6',
  pharmacyC: '27AADFP1234C1Z7',
  pharmacyPending: '27AADFP1234D1Z8',
} as const;
