import { expect, test } from '@playwright/test';

test.describe('Nimbus storefront', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the hero and catalog', async ({ page }) => {
    await expect(page).toHaveTitle(/Nimbus Store/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('opinionated pipeline');
    await expect(page.getByRole('article').first()).toBeVisible();
    // Five products in the catalog plus the order summary aside.
    await expect(page.getByRole('region', { name: 'Catalog' }).getByRole('article')).toHaveCount(5);
  });

  test('adds and removes items from the bag', async ({ page }) => {
    const quantity = page.getByTestId('qty-NB-001');
    await expect(quantity).toHaveText('0');

    await page.getByRole('button', { name: 'Add one Stratus Hoodie' }).click();
    await expect(quantity).toHaveText('1');

    await page.getByRole('button', { name: 'Add one Stratus Hoodie' }).click();
    await expect(quantity).toHaveText('2');

    await page.getByRole('button', { name: 'Remove one Stratus Hoodie' }).click();
    await expect(quantity).toHaveText('1');
  });

  test('shows an order summary with every monetary line', async ({ page }) => {
    for (const line of ['subtotal', 'discount', 'tax', 'shipping', 'total']) {
      await expect(page.getByTestId(line)).toBeVisible();
      await expect(page.getByTestId(line)).not.toBeEmpty();
    }
  });

  test('waives shipping once the free-shipping threshold is met', async ({ page }) => {
    await expect(page.getByTestId('shipping')).toHaveText(/\$/);

    // Three hoodies at $68.50 clears the $150 threshold.
    for (let i = 0; i < 3; i += 1) {
      await page.getByRole('button', { name: 'Add one Stratus Hoodie' }).click();
    }

    await expect(page.getByTestId('shipping')).toHaveText('Free');
  });

  test('has a visible cart badge', async ({ page }) => {
    await expect(page.getByTestId('cart-badge')).toBeVisible();
  });

  test('counts units, not product lines, in the cart badge', async ({ page }) => {
    const badge = page.getByTestId('cart-badge');

    // The bag starts with three Cirrus Mugs and two Contrail Socks: five units
    // across two product lines.
    await expect(badge).toHaveText('5');
    await expect(badge).toHaveAttribute('aria-label', 'Cart, 5 items');

    for (let i = 0; i < 2; i += 1) {
      await page.getByRole('button', { name: 'Remove one Cirrus Mug' }).click();
    }
    for (let i = 0; i < 2; i += 1) {
      await page.getByRole('button', { name: 'Remove one Contrail Socks' }).click();
    }

    // One unit left: the accessible label must be singular.
    await expect(badge).toHaveText('1');
    await expect(badge).toHaveAttribute('aria-label', 'Cart, 1 item');
  });
});
