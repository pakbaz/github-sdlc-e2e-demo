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
 * The defect: money is accumulated in floating point and only rounded at the
 * very end, so representation error leaks into the total. Discounts and tax
 * compound the error.
 *
 * The fix a coding agent should make: do all arithmetic in integer minor units
 * (cents) and round once, at each monetary boundary.
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
 * BUG: every intermediate value stays in floating point and is only rounded on
 * the way out, so `0.1 + 0.2`-class errors accumulate across lines, discount
 * and tax. On realistic carts this produces totals that are off by a cent or
 * more — which is a genuine P0 for a storefront.
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

  let subtotal = 0;
  for (const item of items) {
    subtotal += item.unitPrice * item.quantity;
  }

  const discount = subtotal * discountRate;
  const taxable = subtotal - discount;
  const tax = taxable * taxRate;
  const shippingCost = subtotal >= freeShippingThreshold ? 0 : shipping;
  const total = taxable + tax + shippingCost;

  return {
    subtotal: roundCurrency(subtotal),
    discount: roundCurrency(discount),
    tax: roundCurrency(tax),
    shipping: roundCurrency(shippingCost),
    total: roundCurrency(total),
  };
}

/** Format a currency amount for display. */
export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(value);
}

// SIMULATED AGENT FIX — reset.sh must remove this line.
