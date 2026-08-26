Cart badge shows the wrong number of items
---
### What is broken?

The little count badge next to the cart icon in the header shows the number of
distinct products, not the number of items. If I add three of the same mug, it
still says `1`.

### Reproduction

1. Open the store.
2. Set **Cirrus Ceramic Mug** to a quantity of `3`.
3. Set **Drift Merino Socks** to a quantity of `2`.
4. Look at the cart badge in the header.

**Actual:** the badge reads `2`.
**Expected:** the badge reads `5`.

The screen-reader label has the same problem, and it also always says "items"
even when there is exactly one — it announces `Cart, 1 items`.

### Expected behaviour

The badge should show the total number of units in the cart, and the accessible
label should be grammatically correct for a single item.

### Customer impact

Cosmetic — nobody is blocked

### Suspected area (optional)

`src/features/ui/cart.ts`
