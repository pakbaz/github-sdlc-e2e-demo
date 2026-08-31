import { describe, expect, it } from 'vitest';
import {
  calculateOrderTotals,
  formatCurrency,
  roundCurrency,
  type LineItem,
} from '../../src/features/checkout/total';

const STORE_OPTIONS = {
  discountRate: 0.1,
  taxRate: 0.0825,
  shipping: 7.95,
  freeShippingThreshold: 150,
};

function item(unitPrice: number, quantity: number): LineItem {
  return { sku: `SKU-${unitPrice}`, name: 'Test item', unitPrice, quantity };
}

describe('roundCurrency', () => {
  it('rounds to two decimal places', () => {
    expect(roundCurrency(2.344)).toBe(2.34);
    expect(roundCurrency(2.345)).toBe(2.35);
    expect(roundCurrency(10)).toBe(10);
  });
});

describe('calculateOrderTotals', () => {
  it('returns zeroed totals for an empty cart', () => {
    const totals = calculateOrderTotals([], STORE_OPTIONS);
    expect(totals.subtotal).toBe(0);
    expect(totals.discount).toBe(0);
    expect(totals.tax).toBe(0);
  });

  it('multiplies unit price by quantity', () => {
    const totals = calculateOrderTotals([item(10, 3)], { taxRate: 0 });
    expect(totals.subtotal).toBe(30);
  });

  it('applies the discount before tax', () => {
    const totals = calculateOrderTotals([item(100, 1)], { discountRate: 0.1, taxRate: 0.1 });
    expect(totals.discount).toBe(10);
    // Tax is charged on 90, not on 100.
    expect(totals.tax).toBe(9);
  });

  it('waives shipping at or above the free-shipping threshold', () => {
    const under = calculateOrderTotals([item(100, 1)], STORE_OPTIONS);
    const over = calculateOrderTotals([item(200, 1)], STORE_OPTIONS);
    expect(under.shipping).toBe(7.95);
    expect(over.shipping).toBe(0);
  });

  /**
   * The invariant a storefront must never break: the total the customer is
   * charged has to equal the numbers printed above it on the receipt.
   *
   * DEMO NOTE — this is the guard for the "checkout" scenario (P0 / risk low).
   * It is currently expressed loosely (a 2-cent tolerance) so `main` stays
   * green while the defect is planted. The seeded issue asks the coding agent
   * to fix `calculateOrderTotals` and tighten this to an exact equality.
   */
  it('keeps the printed receipt internally consistent', () => {
    const totals = calculateOrderTotals([item(27.75, 1)], STORE_OPTIONS);
    const printed = totals.subtotal - totals.discount + totals.tax + totals.shipping;
    expect(Math.abs(totals.total - printed)).toBeLessThanOrEqual(0.02);
  });
});

describe('formatCurrency', () => {
  it('formats as US dollars', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
    expect(formatCurrency(0)).toBe('$0.00');
  });
});
