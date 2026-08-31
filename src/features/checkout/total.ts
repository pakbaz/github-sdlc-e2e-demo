/**
 * Checkout money maths.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEMO SCENARIO: "checkout" — Priority P0 / Risk LOW  →  AUTOMATED LANE
 * ─────────────────────────────────────────────────────────────────────────────
 * This module contains an intentional, realistic defect used by the Agentic
 * SDLC demo. It is *critical* (customers are charged the wrong amount) but the
 * blast radius is tiny: one pure function, fully covered by unit tests, no
 * security or infrastructure surface. That combination — high priority, low
 * risk — is exactly what should be allowed to ship without a human gate.
 *
 * The defect (fixed): money used to be accumulated in floating point and
 * only rounded at the very end, so representation error leaked into the
 * total. Discounts and tax compounded the error.
 *
 * The fix: all arithmetic happens in integer minor units (cents), rounded
 * once at each monetary boundary.
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

/**
 * Compute the totals for an order.
 *
 * Every monetary boundary is rounded exactly once, in integer minor units
 * (cents), so intermediate floating-point error can never leak into the
 * printed total. `total` is always the sum of the printed lines:
 * `subtotal - discount + tax + shipping`.
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
    subtotalCents += Math.round(item.unitPrice * 100) * item.quantity;
  }

  const discountCents = Math.round(subtotalCents * discountRate);
  const taxableCents = subtotalCents - discountCents;
  const taxCents = Math.round(taxableCents * taxRate);
  const freeShippingThresholdCents = Math.round(freeShippingThreshold * 100);
  const shippingCents =
    subtotalCents >= freeShippingThresholdCents ? 0 : Math.round(shipping * 100);
  const totalCents = taxableCents + taxCents + shippingCents;

  return {
    subtotal: subtotalCents / 100,
    discount: discountCents / 100,
    tax: taxCents / 100,
    shipping: shippingCents / 100,
    total: totalCents / 100,
  };
}

/** Format a currency amount for display. */
export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(value);
}
