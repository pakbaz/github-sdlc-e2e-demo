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

  it('sums quantities across multiple lines, not the number of distinct lines', () => {
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

  it('uses the singular "item" for a count of one', () => {
    expect(cartAriaLabel(1)).toBe('Cart, 1 item');
  });

  it('uses the plural "items" for counts other than one', () => {
    expect(cartAriaLabel(0)).toBe('Cart, 0 items');
    expect(cartAriaLabel(2)).toBe('Cart, 2 items');
  });
});

/**
 * DEMO NOTE — the "ui" scenario (P3 / risk LOW), resolved.
 *
 * `cartBadgeCount` used to count distinct lines instead of total units, and
 * `cartAriaLabel` always said "items" so a one-item cart read "1 items".
 * The tests above now cover both regressions directly.
 *
 * Because `src/features/ui/**` has no CODEOWNER, the resulting pull request
 * needs zero human approvals: it merges and deploys itself.
 */
