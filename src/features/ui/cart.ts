/**
 * Cart presentation helpers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEMO SCENARIO: "ui" — Priority P3 / Risk LOW  →  AUTOMATED LANE
 * ─────────────────────────────────────────────────────────────────────────────
 * This module contains an intentional, cosmetic defect used by the Agentic SDLC
 * demo. Nothing here touches money, auth, infrastructure or shared plumbing:
 * `src/features/ui/**` deliberately has NO entry in `.github/CODEOWNERS`, so a
 * pull request that only touches this directory needs zero human approvals and
 * can merge and deploy itself.
 *
 * The cart badge presents the total number of units across all product lines.
 */

export interface CartLine {
  sku: string;
  quantity: number;
}

/**
 * Number to render inside the cart badge.
 *
 * Quantities are summed so multiple copies of a product each count as an item.
 */
export function cartBadgeCount(lines: readonly CartLine[]): number {
  return lines.reduce((count, line) => count + line.quantity, 0);
}

/**
 * Clamp the badge to a readable width, e.g. 132 → "99+".
 */
export function formatBadge(count: number): string {
  if (count <= 0) {
    return '';
  }
  return count > 99 ? '99+' : String(count);
}

/**
 * Accessible label for the cart button.
 */
export function cartAriaLabel(count: number): string {
  return `Cart, ${count} ${count === 1 ? 'item' : 'items'}`;
}
