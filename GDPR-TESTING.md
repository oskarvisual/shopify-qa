# GDPR Webhooks Testing Guide

This guide explains how to test the GDPR compliance webhooks implemented in your Shopify app.

## 🔒 Security Notice

**IMPORTANT:** All testing tools are protected and will only work in development mode:

- ✅ The `/app/gdpr-test` UI returns 404 in production
- ✅ The seed script exits if `NODE_ENV=production`
- ✅ The test webhook script shows a warning and 5-second delay in production
- ✅ Shop redaction test only works in development mode

This ensures you don't accidentally expose test interfaces or trigger unintended data operations in production.

## 📋 What's Implemented

Your app now handles three mandatory GDPR webhooks:

1. **`customers/data_request`** - When a customer requests their personal data
2. **`customers/redact`** - When a customer requests deletion of their data
3. **`shop/redact`** - When a store uninstalls the app (48 hours after)

## 🧪 Testing Methods

### Method 1: Using the Built-in Test UI (Easiest)

**⚠️ Development Only:** This interface is only accessible when `NODE_ENV` is not set to `production`.

1. Start your app:
   ```bash
   shopify app dev
   ```

2. Access the test interface:
   - Go to your Shopify Admin
   - Open your app
   - Navigate to: **http://localhost:60713/app/gdpr-test**
   - Or add `/gdpr-test` to your app URL
   - In production, this route returns a 404 error

3. Test each webhook:
   - Enter a customer email (e.g., one that submitted a question)
   - Click the button for the webhook you want to test
   - Check the results on the page

**What each test does:**

- **Test Data Request**: Gathers all customer data and sends it via email
- **Test Customer Redact**: Anonymizes customer data in the database
- **Test Shop Redact**: ⚠️ Deletes ALL shop data (only works in dev mode)

### Method 2: Using the CLI Script

**⚠️ Production Warning:** In production mode, this script will show a warning and wait 5 seconds before proceeding.

Run the test script from the command line:

```bash
# Test data request
node scripts/test-gdpr-webhook.js data_request

# Test customer redaction
node scripts/test-gdpr-webhook.js customer_redact

# Test shop redaction
node scripts/test-gdpr-webhook.js shop_redact
```

**Custom URL:**
```bash
node scripts/test-gdpr-webhook.js data_request https://your-tunnel-url.trycloudflare.com
```

### Method 3: Using curl (Manual)

Create a test payload and send it:

```bash
# Set your variables
export SHOP_DOMAIN="tests-products-questions-and-answers.myshopify.com"
export CUSTOMER_EMAIL="customer@example.com"
export WEBHOOK_URL="http://localhost:60713/webhooks/customers/data_request"

# Create HMAC signature (you'll need your SHOPIFY_API_SECRET)
PAYLOAD='{"shop_domain":"'$SHOP_DOMAIN'","customer":{"id":123,"email":"'$CUSTOMER_EMAIL'"}}'
HMAC=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SHOPIFY_API_SECRET" -binary | base64)

# Send the webhook
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Topic: customers/data_request" \
  -H "X-Shopify-Hmac-Sha256: $HMAC" \
  -H "X-Shopify-Shop-Domain: $SHOP_DOMAIN" \
  -d "$PAYLOAD"
```

### Method 4: From Shopify Admin (Production)

Once deployed to production:

1. Go to your Shopify Admin
2. Navigate to **Settings** → **Customer privacy**
3. Search for a customer
4. Click **Request customer data**
5. Shopify will send the webhook to your app

## 📊 Verifying the Results

### For Data Requests:

1. **Check the logs:**
   ```bash
   # In your terminal running shopify app dev
   # Look for lines starting with [GDPR]
   ```

2. **Check the database:**
   ```sql
   SELECT * FROM GdprRequest
   WHERE requestType = 'data_request'
   ORDER BY createdAt DESC
   LIMIT 5;
   ```

3. **Check the email:**
   - The email is sent via your automation system
   - Check your email service logs
   - In dev mode, the full JSON is printed to console

### For Customer Redaction:

1. **Check the database:**
   ```sql
   -- Should show anonymized data
   SELECT customerEmail, customerName
   FROM Question
   WHERE customerEmail = 'redacted@privacy.invalid';

   SELECT authorEmail, authorName
   FROM Answer
   WHERE authorEmail = 'redacted@privacy.invalid';
   ```

2. **Verify GDPR log:**
   ```sql
   SELECT * FROM GdprRequest
   WHERE requestType = 'customer_redact'
   ORDER BY createdAt DESC;
   ```

### For Shop Redaction:

1. **Check all tables are empty:**
   ```sql
   SELECT COUNT(*) FROM Question WHERE shop = 'your-shop.myshopify.com';
   SELECT COUNT(*) FROM AILog WHERE shop = 'your-shop.myshopify.com';
   SELECT COUNT(*) FROM AutomationLog WHERE shop = 'your-shop.myshopify.com';
   ```

## 🎯 Test Scenarios

### Scenario 1: Customer with Questions

1. Create a test question with a specific email
2. Run data request with that email
3. Verify email is sent with the question data

### Scenario 2: Customer with Multiple Interactions

1. Create:
   - A question (with customerEmail)
   - An answer (with authorEmail)
   - Vote on a question
   - Ask an AI question
2. Run data request
3. Verify all data is included in the email

### Scenario 3: Customer Wants to Be Forgotten

1. Create test data with a customer email
2. Run customer redaction
3. Verify all instances of the email are replaced with "redacted@privacy.invalid"
4. Verify names are replaced with "Redacted User"

## 📧 Email Testing

The GDPR data request sends an email to the customer with their data.

**Email contents:**
- Summary (questions, answers, votes, AI interactions count)
- Complete JSON data (expandable section)
- Professional HTML formatting

**To test email delivery:**

1. Set up SMTP in your `.env`:
   ```env
   SMTP_HOST="smtp.example.com"
   SMTP_PORT="587"
   SMTP_USER="your-email@example.com"
   SMTP_PASS="your-password"
   SMTP_FROM_EMAIL="privacy@orivisdev.shop"
   SMTP_SECURE="true"
   ```

2. Run the data request test

3. Check the recipient inbox

## 🔒 Security Notes

- **Testing Interface Protection:** The `/app/gdpr-test` route returns 404 in production
- **Script Protection:** The seed script exits immediately if `NODE_ENV=production`
- **Webhook Script Warning:** Shows 5-second warning if used in production
- **Shop Redaction:** Only works in development mode (hard-coded check)
- **HMAC Verification:** All webhooks verify HMAC signatures automatically
- **Authentication:** Handled by `authenticate.webhook()` from Shopify
- **Audit Trail:** All GDPR requests are logged in the GdprRequest table

### Environment Variable

To ensure maximum safety, set `NODE_ENV=production` in your production environment:

```bash
# In production .env or hosting platform
NODE_ENV=production
```

This will automatically disable all testing tools and prevent accidental data operations.

## 🐛 Troubleshooting

### Webhook not receiving data:
- Check that your app is running
- Verify the URL is accessible
- Check HMAC signature is correct
- Look for errors in console

### Email not sending:
- Verify SMTP settings in `.env`
- Check automation logs in database
- Look for email errors in console logs

### Database not updating:
- Verify Prisma schema is up to date: `npx prisma generate`
- Check database connection
- Look for SQL errors in console

## 📝 Compliance Checklist

Before submitting to Shopify:

- [ ] All 3 GDPR webhooks are registered in `shopify.app.toml`
- [ ] Webhooks respond within 5 seconds
- [ ] Customer data requests return all personal data
- [ ] Customer redaction anonymizes all personal data
- [ ] Shop redaction deletes all shop data
- [ ] HMAC signatures are verified
- [ ] All requests are logged for auditing
- [ ] Email delivery is tested and working

## 🚀 Next Steps

1. Test all three webhooks locally
2. Deploy to production: `shopify app deploy`
3. Verify webhooks in Partner Dashboard
4. Submit app for review

## 📚 Resources

- [Shopify GDPR Documentation](https://shopify.dev/docs/apps/build/privacy-law-compliance)
- [Webhook HMAC Verification](https://shopify.dev/docs/apps/build/webhooks/verify-webhooks)
- [Mandatory Webhooks](https://shopify.dev/docs/apps/build/privacy-law-compliance/mandatory-webhooks)
