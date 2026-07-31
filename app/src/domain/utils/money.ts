export function roundMoney(value: number, mode: 'nearest' | 'up' | 'down' = 'nearest'): number {
  const cents = value * 100;
  let rounded: number;
  if (mode === 'up') rounded = Math.ceil(cents - 1e-9);
  else if (mode === 'down') rounded = Math.floor(cents + 1e-9);
  else rounded = Math.round(cents);
  return rounded / 100;
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function nearlyEqual(a: number, b: number, eps = 0.005): boolean {
  return Math.abs(a - b) <= eps;
}
