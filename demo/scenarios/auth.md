Expired sessions are still accepted
---
### What is broken?

Session expiry is never checked. A session that expired days ago still passes
validation, so signing a user out or waiting for a token to lapse has no
effect. Anyone holding an old token keeps full access indefinitely.

There is a second problem next to it: session state restored from storage is
cast straight to the session type without any validation, so hand-edited or
corrupted stored state is trusted as-is.

### Reproduction

1. Create a session.
2. Move the clock past `expiresAt` (or construct a session with an `expiresAt`
   in the past).
3. Call `isSessionValid` on it.

**Actual:** returns `true`.
**Expected:** returns `false`.

Also:

1. Put `{"userId": 123}` into the persisted session slot.
2. Call `parseSession` on it.

**Actual:** returns an object that is treated as a valid session.
**Expected:** rejects it.

### Expected behaviour

`isSessionValid` must consult `expiresAt` against an injectable clock so the
behaviour is testable, and `parseSession` must validate the shape of what it
parses before returning it. Neither the session lifetime nor the scope set
should be widened to make anything pass.

### Customer impact

Critical — customers are losing money, data, or access

### Suspected area (optional)

`src/features/auth/session.ts`
