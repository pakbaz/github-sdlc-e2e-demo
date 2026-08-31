/**
 * Checkout money maths.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEMO SCENARIO: "checkout" — Priority P0 / Risk LOW  →  AUTOMATED LANE
 * ─────────────────────────────────────────────────────────────────────────────
 * This module contained an intentional, realistic defect used by the Agentic
 * SDLC demo. It was *critical* (customers were charged the wrong amount) but
 * the blast radius was tiny: one pure function, fully covered by unit tests,
 * no security or infrastructure surface. That combination — high priority,
 * low risk — is exactly what should be allowed to ship without a human gate.
 *
 * The defect: money was accumulated in floating point and only rounded at the
 * very end, so representation error leaked into the total. Discounts and tax
 * compounded the error.
 *
 * The fix: all arithmetic is now done in integer minor units (cents), rounded
 * once at each monetary boundary (see `toCents` / `fromCents` below).
 */

export interface LineItem {
  sku: string;
  name: string;
  /** Unit price in whole currency units, e.g. 10.99 */
  unitPrice: number;
  quantity: number;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
}

export interface TotalsOptions {
  /** Fractional discount, e.g. 0.1 for 10% off. */
  discountRate?: number;
  /** Fractional tax rate, e.g. 0.0825 for 8.25%. */
  taxRate?: number;
  /** Flat shipping cost in whole currency units. */
  shipping?: number;
  /** Orders at or above this subtotal ship free. */
  freeShippingThreshold?: number;
}

/** Round a currency amount to 2 decimal places. */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Convert a whole-currency amount to integer minor units (cents). */
function toCents(value: number): number {
  return Math.round(value * 100);
}

/** Convert integer minor units (cents) back to a whole-currency amount. */
function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Compute the totals for an order.
 *
 * Every monetary boundary (line total, discount, tax, shipping) is rounded to
 * the nearest cent as integer minor units, and the grand total is derived by
 * summing those already-rounded cents. This guarantees
 * `total === subtotal - discount + tax + shipping` on the printed receipt,
 * instead of letting floating-point representation error leak in from
 * accumulating unrounded intermediate values.
 */
export function calculateOrderTotals(
  items: readonly LineItem[],
  options: TotalsOptions = {},
): OrderTotals {
  const {
    discountRate = 0,
    taxRate = 0,
    shipping = 0,
    freeShippingThreshold = Number.POSITIVE_INFINITY,
  } = options;

  let subtotalCents = 0;
  for (const item of items) {
    subtotalCents += toCents(item.unitPrice) * item.quantity;
  }

  const discountCents = Math.round(subtotalCents * discountRate);
  const taxableCents = subtotalCents - discountCents;
  const taxCents = Math.round(taxableCents * taxRate);
  const subtotal = fromCents(subtotalCents);
  const shippingCents = subtotal >= freeShippingThreshold ? 0 : toCents(shipping);
  const totalCents = taxableCents + taxCents + shippingCents;

  return {
    subtotal,
    discount: fromCents(discountCents),
    tax: fromCents(taxCents),
    shipping: fromCents(shippingCents),
    total: fromCents(totalCents),
  };
}

/** Format a currency amount for display. */
export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(value);
}
