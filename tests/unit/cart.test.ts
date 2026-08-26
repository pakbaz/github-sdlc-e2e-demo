import { describe, expect, it } from 'vitest';
import { cartAriaLabel, cartBadgeCount, formatBadge, type CartLine } from '../../src/features/ui/cart';

const lines = (...quantities: number[]): CartLine[] =>
  quantities.map((quantity, index) => ({ sku: `SKU-${index}`, quantity }));

describe('cartBadgeCount', () => {
  it('is zero for an empty cart', () => {
    expect(cartBadgeCount([])).toBe(0);
  });

  it('is one for a single unit of a single product', () => {
    expect(cartBadgeCount(lines(1))).toBe(1);
  });

  it('counts the total units across product lines', () => {
    expect(cartBadgeCount(lines(3, 2))).toBe(5);
  });
});

describe('formatBadge', () => {
  it('renders nothing for an empty cart', () => {
    expect(formatBadge(0)).toBe('');
    expect(formatBadge(-3)).toBe('');
  });

  it('renders the exact count up to 99', () => {
    expect(formatBadge(7)).toBe('7');
    expect(formatBadge(99)).toBe('99');
  });

  it('clamps above 99', () => {
    expect(formatBadge(100)).toBe('99+');
    expect(formatBadge(1024)).toBe('99+');
  });
});

describe('cartAriaLabel', () => {
  it('describes the cart contents', () => {
    expect(cartAriaLabel(3)).toContain('3');
    expect(cartAriaLabel(3)).toContain('Cart');
  });

  it('uses the correct singular and plural item labels', () => {
    expect(cartAriaLabel(1)).toBe('Cart, 1 item');
    expect(cartAriaLabel(5)).toBe('Cart, 5 items');
  });
});

/**
 * DEMO NOTE — the "ui" scenario (P3 / risk LOW).
 *
 * `cartBadgeCount` counts distinct lines instead of total units, and
 * `cartAriaLabel` always says "items" so a one-item cart reads "1 items".
 * The tests above deliberately avoid those cases so `main` stays green.
 *
 * The seeded issue asks the coding agent to fix both and add regression tests.
 * Because `src/features/ui/**` has no CODEOWNER, the resulting pull request
 * needs zero human approvals: it merges and deploys itself.
 */
