1. Add paid subscription tiers with Stripe Billing
   1. Create Free, Plus, and Pro prices in Stripe.
   2. Add Stripe-hosted Checkout for upgrades and the Stripe customer portal for billing changes and cancellations.
   3. Persist the Stripe customer and subscription state against the authenticated Clerk user ID.
   4. Process and verify Stripe webhooks, granting paid access only while the subscription is `active` or `trialing`.
   5. Enforce tier entitlements in server APIs, not only in the client UI.

Paid tier features:
1. Multiple scenarios
2. Monte Carlo
3. PDF Exports
4. Tax integration
   a. User says which state they are from
   b. Tax calculations are adjusted based on the user's state and income