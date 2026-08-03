import { roundMoney } from '../utils/money';

export function marginFromSale(cost: number, sale: number): number {
  if (cost <= 0) return 0;
  return roundMoney(((sale - cost) / cost) * 100);
}

export function saleFromMargin(cost: number, marginPct: number): number {
  return roundMoney(cost * (1 + marginPct / 100));
}
