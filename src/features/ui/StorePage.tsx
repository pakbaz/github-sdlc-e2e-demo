import { useMemo, useState } from 'react';
import { cartAriaLabel, cartBadgeCount, formatBadge, type CartLine } from './cart';
import {
  calculateOrderTotals,
  formatCurrency,
  type LineItem,
} from '../checkout/total';

interface Product {
  sku: string;
  name: string;
  blurb: string;
  price: number;
  swatch: string;
}

const CATALOG: Product[] = [
  { sku: 'NB-001', name: 'Stratus Hoodie', blurb: 'Brushed fleece, cloud grey', price: 68.5, swatch: '#8fa6c4' },
  { sku: 'NB-002', name: 'Cirrus Mug', blurb: 'Double-walled, 12 oz', price: 19.99, swatch: '#d6b48a' },
  { sku: 'NB-003', name: 'Nimbus Tee', blurb: 'Organic cotton, storm navy', price: 32.25, swatch: '#5c6f96' },
  { sku: 'NB-004', name: 'Altocumulus Cap', blurb: 'Six-panel, adjustable', price: 27.75, swatch: '#a8b8a0' },
  { sku: 'NB-005', name: 'Contrail Socks', blurb: 'Merino blend, pack of two', price: 14.35, swatch: '#c99a9a' },
];

const TAX_RATE = 0.0825;
const DISCOUNT_RATE = 0.1;
const SHIPPING = 7.95;
const FREE_SHIPPING_THRESHOLD = 150;

export function StorePage() {
  const [cart, setCart] = useState<Record<string, number>>({ 'NB-002': 3, 'NB-005': 2 });

  const lines: CartLine[] = useMemo(
    () => Object.entries(cart).map(([sku, quantity]) => ({ sku, quantity })),
    [cart],
  );

  const items: LineItem[] = useMemo(
    () =>
      Object.entries(cart).map(([sku, quantity]) => {
        const product = CATALOG.find((candidate) => candidate.sku === sku)!;
        return { sku, name: product.name, unitPrice: product.price, quantity };
      }),
    [cart],
  );

  const totals = useMemo(
    () =>
      calculateOrderTotals(items, {
        discountRate: DISCOUNT_RATE,
        taxRate: TAX_RATE,
        shipping: SHIPPING,
        freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
      }),
    [items],
  );

  const badge = cartBadgeCount(lines);

  const add = (sku: string) => setCart((prev) => ({ ...prev, [sku]: (prev[sku] ?? 0) + 1 }));
  const remove = (sku: string) =>
    setCart((prev) => {
      const next = { ...prev };
      const quantity = (next[sku] ?? 0) - 1;
      if (quantity <= 0) delete next[sku];
      else next[sku] = quantity;
      return next;
    });

  return (
    <div className="store">
      <section className="hero">
        <p className="hero__eyebrow">Nimbus Store</p>
        <h1 className="hero__title">
          A small shop with a<br />
          <em>very</em> opinionated pipeline.
        </h1>
        <p className="hero__lede">
          This storefront is deliberately imperfect. Each defect is wired to a demo scenario that
          shows GitHub agents triaging, fixing, reviewing and shipping — or stopping at a human gate
          when the risk earns one.
        </p>
        <div className="hero__actions">
          <a className="button button--primary" href="#/pipeline">
            Watch the pipeline
          </a>
          <a className="button" href="#/policy">
            Read the policy
          </a>
        </div>
      </section>

      <section className="store__grid" aria-label="Catalog">
        <div className="catalog">
          {CATALOG.map((product) => (
            <article className="card" key={product.sku}>
              <div className="card__swatch" style={{ background: product.swatch }} aria-hidden="true">
                <span className="card__sku">{product.sku}</span>
              </div>
              <div className="card__body">
                <h3 className="card__name">{product.name}</h3>
                <p className="card__blurb">{product.blurb}</p>
                <div className="card__row">
                  <span className="card__price">{formatCurrency(product.price)}</span>
                  <div className="stepper">
                    <button
                      type="button"
                      className="stepper__btn"
                      onClick={() => remove(product.sku)}
                      aria-label={`Remove one ${product.name}`}
                      disabled={!cart[product.sku]}
                    >
                      −
                    </button>
                    <span className="stepper__value" data-testid={`qty-${product.sku}`}>
                      {cart[product.sku] ?? 0}
                    </span>
                    <button
                      type="button"
                      className="stepper__btn"
                      onClick={() => add(product.sku)}
                      aria-label={`Add one ${product.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <aside className="summary" aria-label="Order summary">
          <div className="summary__head">
            <h2 className="summary__title">Your bag</h2>
            <span
              className="summary__badge"
              data-testid="cart-badge"
              aria-label={cartAriaLabel(badge)}
            >
              {formatBadge(badge)}
            </span>
          </div>

          {items.length === 0 ? (
            <p className="summary__empty">Nothing in the bag yet.</p>
          ) : (
            <ul className="summary__lines">
              {items.map((item) => (
                <li key={item.sku} className="summary__line">
                  <span>
                    {item.name} <span className="summary__qty">× {item.quantity}</span>
                  </span>
                  <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                </li>
              ))}
            </ul>
          )}

          <dl className="summary__totals">
            <div>
              <dt>Subtotal</dt>
              <dd data-testid="subtotal">{formatCurrency(totals.subtotal)}</dd>
            </div>
            <div>
              <dt>Discount (10%)</dt>
              <dd data-testid="discount">−{formatCurrency(totals.discount)}</dd>
            </div>
            <div>
              <dt>Tax (8.25%)</dt>
              <dd data-testid="tax">{formatCurrency(totals.tax)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd data-testid="shipping">
                {totals.shipping === 0 ? 'Free' : formatCurrency(totals.shipping)}
              </dd>
            </div>
            <div className="summary__grand">
              <dt>Total</dt>
              <dd data-testid="total">{formatCurrency(totals.total)}</dd>
            </div>
          </dl>

          <button type="button" className="button button--primary button--block">
            Checkout
          </button>
        </aside>
      </section>
    </div>
  );
}
