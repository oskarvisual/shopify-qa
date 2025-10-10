# Billing System Documentation

## Overview

This app implements a subscription-based billing system with three tiers:
- **FREE**: Basic features with branding
- **PRO**: $15/month - Advanced features including webhooks, export, and translations
- **ULTRA**: $40/month - All features including AI automation

## Development vs Production

### Development Mode (Current)

When developing locally or with a non-public app, the Shopify Billing API is **not available**. This is expected behavior from Shopify.

**Error you'll see without mock mode:**
```json
{
  "error": "Apps without a public distribution cannot use the Billing API"
}
```

**Solution:** We use mock billing mode (enabled by default in `.env`):
```bash
MOCK_BILLING="true"
```

With mock mode enabled:
1. Clicking an upgrade button will simulate the billing flow
2. The plan will be saved to your database
3. All features will unlock as if the subscription was real
4. No actual charges are created in Shopify

### Production Mode

When you publish your app to the Shopify App Store or make it available as a custom app:

1. **Update scopes**: Add `write_payments` scope to `shopify.app.toml` (only after app is approved for billing)
   ```toml
   scopes = "write_products,read_products,write_payments"
   ```
   **Important**: Don't add this scope until your app is approved for billing by Shopify, or you'll get an "invalid scopes" error.

2. **Disable mock mode**: Set `MOCK_BILLING="false"` in production `.env`
3. **Test charges**: In development stores, charges will be marked as "test" and won't actually charge
4. **Real charges**: In production stores, real charges will be created

## File Structure

### Core Files

- **`app/lib/plans.js`**: Plan definitions, features, and billing configuration
- **`app/lib/plans.server.js`**: Server-side plan context loading
- **`app/lib/plan-context.jsx`**: React context for accessing plan data in components
- **`app/routes/app.billing.jsx`**: Handles upgrade button clicks and creates subscriptions
- **`app/routes/app.billing.confirm.jsx`**: Handles the return flow after Shopify billing approval

### Configuration

- **`.env`**: Contains `MOCK_BILLING` flag
- **`shopify.app.toml`**: Contains `write_payments` scope

## How It Works

### 1. User Clicks Upgrade Button

Location: `app/routes/app.settings.jsx:326-333`

```javascript
const handleUpgrade = useCallback(
  (targetPlan) => {
    const billingPlan = getBillingPlan(targetPlan);
    if (!billingPlan) return;
    billingFetcher.submit({ plan: targetPlan }, { method: "post", action: "/app/billing" });
  },
  [billingFetcher]
);
```

### 2. Billing Route Processes Request

Location: `app/routes/app.billing.jsx:42-118`

**Mock Mode (Development):**
- Skips Shopify API call
- Redirects directly to confirm page with `mock=true` parameter
- Logs: `[BILLING] Using mock billing flow - skipping Shopify API call`

**Real Mode (Production):**
- Creates GraphQL mutation to Shopify
- Gets `confirmationUrl` from Shopify
- Redirects merchant to Shopify's billing approval page

### 3. Confirmation Flow

Location: `app/routes/app.billing.confirm.jsx:23-90`

**Mock Mode:**
- Simulates active subscription
- Saves plan to database immediately
- Redirects with `upgrade=success`

**Real Mode:**
- Queries Shopify for active subscriptions
- Validates subscription is ACTIVE
- Saves plan to database
- Redirects with success or pending status

### 4. Database Persistence

The plan is saved to the `config` table:
```javascript
await prisma.config.upsert({
  where: { key: `subscription.plan.${shop}` },
  update: { value: "pro" }, // or "ultra"
  create: { key: `subscription.plan.${shop}`, value: "pro" },
});
```

### 5. Feature Access Control

Plans control feature access throughout the app:

```javascript
// In any component
import { usePlanFeature } from "../lib/plan-context";
import { PlanFeature } from "../lib/plans";

const canUseAI = usePlanFeature(PlanFeature.SETTINGS_AI);

if (canUseAI) {
  // Show AI features
} else {
  // Show upgrade banner
}
```

## Testing the Billing System

### Local Development Testing

1. **Ensure mock mode is enabled** (should be by default):
   ```bash
   # In .env
   MOCK_BILLING="true"
   ```

2. **Start the app**:
   ```bash
   shopify app dev
   ```

3. **Navigate to Settings**: Go to your app in Shopify Admin → Settings

4. **Click any upgrade button**:
   - Pro Plan: $15/mo
   - Ultra Plan: $40/mo

5. **Verify in console**: You should see:
   ```
   [BILLING] Creating subscription { plan: 'pro', mockBilling: true, ... }
   [BILLING] Using mock billing flow - skipping Shopify API call
   [BILLING CONFIRM] Mock mode - simulating active subscription for plan: pro
   [BILLING CONFIRM] Saving plan to database
   ```

6. **Check database**:
   ```sql
   SELECT * FROM config WHERE key LIKE 'subscription.plan.%';
   ```

7. **Verify features unlock**: Navigate around the app - AI settings, webhooks, etc. should now be accessible

### Testing with Shopify Development Store

Once you want to test the real billing flow:

1. **Create a development store** in your Partner Dashboard

2. **Install your app** on the development store

3. **Disable mock mode**:
   ```bash
   MOCK_BILLING="false"
   ```

4. **Restart your app**: `shopify app dev`

5. **Try to upgrade**:
   - If app is not public/custom approved: You'll get the "public distribution" error
   - If app is approved: You'll be redirected to Shopify's billing approval page

6. **Approve the charge** in Shopify (it will be marked as "test")

7. **Return to app**: The plan should be active

## Debugging

All billing operations include detailed logging:

- `[BILLING]` - Main billing route logs
- `[BILLING CONFIRM]` - Confirmation route logs

Check your terminal/console for these logs to debug issues.

### Common Issues

**Issue**: "Apps without a public distribution cannot use the Billing API"
- **Solution**: This is normal for development. Ensure `MOCK_BILLING="true"`

**Issue**: Upgrade button does nothing
- **Solution**: Check browser console and server logs for errors

**Issue**: Plan doesn't save to database
- **Solution**: Check Prisma connection, verify `config` table exists

**Issue**: Features don't unlock after upgrade
- **Solution**: Refresh the page, check `PlanProvider` is wrapping your app in `app/routes/app.jsx`

## Adding New Features to Plans

1. **Add feature constant** in `app/lib/plans.js`:
   ```javascript
   export const PlanFeature = {
     // ... existing features
     MY_NEW_FEATURE: "myNewFeature",
   };
   ```

2. **Configure which plans have it** in `PLAN_FEATURE_MAP`:
   ```javascript
   const PLAN_FEATURE_MAP = {
     [SubscriptionPlan.FREE]: {
       // ...
       [PlanFeature.MY_NEW_FEATURE]: false,
     },
     [SubscriptionPlan.PRO]: {
       // ...
       [PlanFeature.MY_NEW_FEATURE]: true,
     },
     // ...
   };
   ```

3. **Use in components**:
   ```javascript
   const canUseFeature = usePlanFeature(PlanFeature.MY_NEW_FEATURE);
   ```

## Security Notes

- **Server-side validation**: Always check plan features on the server, not just client-side
- **Scope permissions**: The `write_payments` scope is required but only works for public/approved apps
- **Database integrity**: The plan is stored in the database and loaded on each request
- **Session plan**: The plan can also be stored in the Shopify session (future enhancement)

## Next Steps for Production

Before launching your app:

1. ✅ Add `write_payments` scope (already done)
2. ⬜ Submit app for review in Partner Dashboard
3. ⬜ Set up pricing in Partner Dashboard (must match your code)
4. ⬜ Test billing flow on development store
5. ⬜ Set `MOCK_BILLING="false"` in production
6. ⬜ Monitor billing webhooks for subscription changes
7. ⬜ Implement subscription cancellation handling
8. ⬜ Add billing usage/history page for customers
