Order total is off by a cent on multi-item carts
---
### What is broken?

The order summary does not add up. The total we charge is one cent higher than
the sum of the lines we show the customer. Support has had three complaints
this week from customers who checked the arithmetic themselves.

### Reproduction

1. Open the store.
2. Set **Cirrus Ceramic Mug** to `3` (3 × $19.99).
3. Set **Drift Merino Socks** to `2` (2 × $14.35).
4. Read the order summary.

**Actual:**

```
Subtotal   $88.67
Discount  -$8.87
Tax        $6.58
Shipping   $7.95
Total      $94.34   ← wrong
```

**Expected:**

```
88.67 - 8.87 + 6.58 + 7.95 = 94.33
```

A single **Zephyr Tote** at $27.75 shows the same problem: the printed lines
sum to `$34.98` but the total reads `$34.99`.

### Expected behaviour

The printed receipt must satisfy `total === subtotal - discount + tax +
shipping` exactly, for every cart. Money should be accumulated in integer minor
units and rounded once at each monetary boundary, rather than accumulated as
floating point and rounded only at the end.

### Customer impact

Critical — customers are losing money, data, or access

### Suspected area (optional)

`src/features/checkout/total.ts`
