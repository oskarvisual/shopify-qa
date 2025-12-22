#!/usr/bin/env node

/**
 * Script to test GDPR webhooks locally
 *
 * Usage:
 * node scripts/test-gdpr-webhook.js data_request
 * node scripts/test-gdpr-webhook.js customer_redact
 * node scripts/test-gdpr-webhook.js shop_redact
 */

import crypto from 'crypto';

const WEBHOOK_TYPES = {
  data_request: {
    topic: 'customers/data_request',
    path: '/webhooks/customers/data_request',
    payload: {
      shop_id: 1234567,
      shop_domain: 'tests-products-questions-and-answers.myshopify.com',
      orders_requested: [],
      customer: {
        id: 9876543210,
        email: 'customer@example.com',
        phone: null,
      },
      data_request: {
        id: 12345,
      },
    },
  },
  customer_redact: {
    topic: 'customers/redact',
    path: '/webhooks/customers/redact',
    payload: {
      shop_id: 1234567,
      shop_domain: 'tests-products-questions-and-answers.myshopify.com',
      customer: {
        id: 9876543210,
        email: 'customer@example.com',
        phone: null,
      },
      orders_to_redact: [],
    },
  },
  shop_redact: {
    topic: 'shop/redact',
    path: '/webhooks/shop/redact',
    payload: {
      shop_id: 1234567,
      shop_domain: 'tests-products-questions-and-answers.myshopify.com',
    },
  },
};

function generateHmac(body, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
}

async function testWebhook(type, targetUrl) {
  const webhookConfig = WEBHOOK_TYPES[type];

  if (!webhookConfig) {
    console.error(`❌ Unknown webhook type: ${type}`);
    console.log(`Available types: ${Object.keys(WEBHOOK_TYPES).join(', ')}`);
    process.exit(1);
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error('❌ SHOPIFY_API_SECRET not found in environment');
    process.exit(1);
  }

  const body = JSON.stringify(webhookConfig.payload);
  const hmac = generateHmac(body, secret);

  const url = `${targetUrl}${webhookConfig.path}`;

  console.log(`\n🧪 Testing GDPR Webhook: ${webhookConfig.topic}`);
  console.log(`📍 URL: ${url}`);
  console.log(`📦 Payload:`, JSON.stringify(webhookConfig.payload, null, 2));
  console.log(`🔐 HMAC: ${hmac}\n`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Topic': webhookConfig.topic,
        'X-Shopify-Hmac-Sha256': hmac,
        'X-Shopify-Shop-Domain': webhookConfig.payload.shop_domain,
        'X-Shopify-API-Version': '2025-07',
      },
      body: body,
    });

    console.log(`✅ Response Status: ${response.status} ${response.statusText}`);

    const responseText = await response.text();
    if (responseText) {
      console.log(`📄 Response Body:`, responseText);
    }

    if (response.ok) {
      console.log(`\n✨ Webhook test successful!`);

      if (type === 'data_request') {
        console.log(`\n📧 Check the email logs or database for the data request.`);
        console.log(`   Customer email: ${webhookConfig.payload.customer.email}`);
      } else if (type === 'customer_redact') {
        console.log(`\n🗑️  Check the database - customer data should be anonymized.`);
        console.log(`   Customer email: ${webhookConfig.payload.customer.email}`);
      } else if (type === 'shop_redact') {
        console.log(`\n🗑️  Check the database - all shop data should be deleted.`);
        console.log(`   Shop: ${webhookConfig.payload.shop_domain}`);
      }
    } else {
      console.log(`\n❌ Webhook test failed!`);
    }
  } catch (error) {
    console.error(`\n❌ Error testing webhook:`, error.message);
    process.exit(1);
  }
}

// Main execution
async function main() {
  // Load environment variables
  await import('dotenv/config');

  // SECURITY: Warn if running in production
  if (process.env.NODE_ENV === 'production') {
    console.error('⚠️  WARNING: You are about to test GDPR webhooks in PRODUCTION!');
    console.error('   This will trigger real data gathering and emails.');
    console.error('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  const webhookType = process.argv[2] || 'data_request';
  const targetUrl = process.argv[3] || 'http://localhost:60713';

  await testWebhook(webhookType, targetUrl);
}

main();
