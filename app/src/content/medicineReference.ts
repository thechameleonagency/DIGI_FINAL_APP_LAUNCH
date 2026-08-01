/** Bundled local medicine reference for CF-36 autofill — no network/AI. */
export type MedicineRef = {
  name: string;
  brand: string;
  manufacturer: string;
  category: string;
  packSize: string;
  typicalMrp: number;
  hsn: string;
  gstPercent: number;
  genericName?: string;
};

export const MEDICINE_REFERENCE: MedicineRef[] = [
  {
    name: 'Dolo 650',
    brand: 'Micro Labs',
    manufacturer: 'Micro Labs Ltd',
    category: 'Analgesic',
    packSize: '15 Tab',
    typicalMrp: 30,
    hsn: '3004',
    gstPercent: 12,
    genericName: 'Paracetamol',
  },
  {
    name: 'Crocin Advance',
    brand: 'GSK',
    manufacturer: 'GlaxoSmithKline',
    category: 'Analgesic',
    packSize: '20 Tab',
    typicalMrp: 45,
    hsn: '3004',
    gstPercent: 12,
    genericName: 'Paracetamol',
  },
  {
    name: 'Augmentin 625',
    brand: 'GSK',
    manufacturer: 'GlaxoSmithKline',
    category: 'Antibiotic',
    packSize: '10 Tab',
    typicalMrp: 220,
    hsn: '3004',
    gstPercent: 12,
    genericName: 'Amoxicillin + Clavulanate',
  },
  {
    name: 'Combiflam',
    brand: 'Sanofi',
    manufacturer: 'Sanofi India',
    category: 'Analgesic',
    packSize: '20 Tab',
    typicalMrp: 50,
    hsn: '3004',
    gstPercent: 12,
    genericName: 'Ibuprofen + Paracetamol',
  },
  {
    name: 'Pantocid 40',
    brand: 'Sun Pharma',
    manufacturer: 'Sun Pharmaceutical',
    category: 'Gastro',
    packSize: '15 Tab',
    typicalMrp: 140,
    hsn: '3004',
    gstPercent: 12,
    genericName: 'Pantoprazole',
  },
  {
    name: 'Azithral 500',
    brand: 'Alembic',
    manufacturer: 'Alembic Pharmaceuticals',
    category: 'Antibiotic',
    packSize: '5 Tab',
    typicalMrp: 130,
    hsn: '3004',
    gstPercent: 12,
    genericName: 'Azithromycin',
  },
  {
    name: 'Metformin 500',
    brand: 'USV',
    manufacturer: 'USV Pvt Ltd',
    category: 'Antidiabetic',
    packSize: '20 Tab',
    typicalMrp: 35,
    hsn: '3004',
    gstPercent: 12,
    genericName: 'Metformin',
  },
  {
    name: 'Telma 40',
    brand: 'Glenmark',
    manufacturer: 'Glenmark Pharmaceuticals',
    category: 'Cardiac',
    packSize: '30 Tab',
    typicalMrp: 280,
    hsn: '3004',
    gstPercent: 12,
    genericName: 'Telmisartan',
  },
  {
    name: 'Cetirizine 10',
    brand: 'Dr Reddy',
    manufacturer: "Dr. Reddy's Laboratories",
    category: 'Antihistamine',
    packSize: '10 Tab',
    typicalMrp: 25,
    hsn: '3004',
    gstPercent: 12,
    genericName: 'Cetirizine',
  },
  {
    name: 'ORS Powder',
    brand: 'Electral',
    manufacturer: 'FDC Limited',
    category: 'Electrolyte',
    packSize: '21.8g Sachet',
    typicalMrp: 22,
    hsn: '3004',
    gstPercent: 12,
  },
];

export function matchMedicineReference(query: string): MedicineRef | undefined {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return undefined;
  return (
    MEDICINE_REFERENCE.find((r) => r.name.toLowerCase() === q) ??
    MEDICINE_REFERENCE.find((r) => r.name.toLowerCase().startsWith(q)) ??
    MEDICINE_REFERENCE.find((r) => r.name.toLowerCase().includes(q) || r.genericName?.toLowerCase().includes(q))
  );
}

/** Fill only empty/missing fields; never overwrite user values. Prices only for new drafts (caller decides). */
export function applyReferenceFill<T extends Record<string, unknown>>(
  current: T,
  ref: MedicineRef,
  opts?: { fillPrices?: boolean },
): { next: T; filled: string[] } {
  const filled: string[] = [];
  const next = { ...current };
  const setIfEmpty = (key: keyof T & string, value: unknown, empty: (v: unknown) => boolean) => {
    if (empty(next[key])) {
      (next as Record<string, unknown>)[key] = value;
      filled.push(key);
    }
  };
  setIfEmpty('brand', ref.brand, (v) => !String(v ?? '').trim());
  setIfEmpty('category', ref.category, (v) => !String(v ?? '').trim());
  setIfEmpty('packSize', ref.packSize, (v) => !String(v ?? '').trim());
  setIfEmpty('hsn', ref.hsn, (v) => !String(v ?? '').trim());
  setIfEmpty('manufacturer', ref.manufacturer, (v) => !String(v ?? '').trim());
  setIfEmpty('genericName', ref.genericName ?? '', (v) => !String(v ?? '').trim());
  if (opts?.fillPrices) {
    setIfEmpty('mrp', ref.typicalMrp, (v) => v == null || v === '' || Number(v) === 0);
    setIfEmpty('gstPercent', ref.gstPercent, (v) => v == null || v === '' || Number(v) === 0);
  } else {
    setIfEmpty('gstPercent', ref.gstPercent, (v) => v == null || v === '' || Number(v) === 0);
  }
  if (!String(next.name ?? '').trim()) {
    (next as Record<string, unknown>).name = ref.name;
    filled.push('name');
  }
  return { next, filled };
}
