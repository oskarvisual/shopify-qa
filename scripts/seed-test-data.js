#!/usr/bin/env node

/**
 * Script to seed test data for GDPR webhook testing
 *
 * Creates sample questions, answers, and votes for a test customer
 * so you can test the GDPR webhooks with realistic data.
 *
 * Usage:
 * node scripts/seed-test-data.js
 */

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

// SECURITY: Only allow in development mode
if (process.env.NODE_ENV === 'production') {
  console.error('❌ ERROR: This script is only available in development mode!');
  console.error('   Seeding test data in production could compromise real customer data.');
  process.exit(1);
}

const prisma = new PrismaClient();

const TEST_CUSTOMER_EMAIL = 'gdpr-test-customer@example.com';
const TEST_CUSTOMER_NAME = 'GDPR Test Customer';
const TEST_SHOP = 'tests-products-questions-and-answers.myshopify.com';
const TEST_PRODUCT_ID = 'gid://shopify/Product/1234567890';

async function seedTestData() {
  console.log('🌱 Seeding test data for GDPR testing...');
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}\n`);

  try {
    // Create test questions
    console.log('Creating test questions...');
    const question1 = await prisma.question.create({
      data: {
        shop: TEST_SHOP,
        productId: TEST_PRODUCT_ID,
        customerName: TEST_CUSTOMER_NAME,
        customerEmail: TEST_CUSTOMER_EMAIL,
        question: 'What are the dimensions of this product?',
        isPublished: true,
        votes: 5,
      },
    });
    console.log(`✅ Created question: ${question1.id}`);

    const question2 = await prisma.question.create({
      data: {
        shop: TEST_SHOP,
        productId: TEST_PRODUCT_ID,
        customerName: TEST_CUSTOMER_NAME,
        customerEmail: TEST_CUSTOMER_EMAIL,
        question: 'Is this product suitable for outdoor use?',
        isPublished: true,
        votes: 3,
      },
    });
    console.log(`✅ Created question: ${question2.id}`);

    const question3 = await prisma.question.create({
      data: {
        shop: TEST_SHOP,
        productId: TEST_PRODUCT_ID,
        customerName: TEST_CUSTOMER_NAME,
        customerEmail: TEST_CUSTOMER_EMAIL,
        question: 'What colors are available?',
        isPublished: false,
      },
    });
    console.log(`✅ Created question: ${question3.id}`);

    // Create test answers
    console.log('\nCreating test answers...');
    const answer1 = await prisma.answer.create({
      data: {
        shop: TEST_SHOP,
        questionId: question1.id,
        authorName: TEST_CUSTOMER_NAME,
        authorEmail: TEST_CUSTOMER_EMAIL,
        answer: 'Based on my experience, it measures approximately 10x8x6 inches.',
        isPublished: true,
      },
    });
    console.log(`✅ Created answer: ${answer1.id}`);

    // Create test votes
    console.log('\nCreating test votes...');
    const vote1 = await prisma.voteLog.create({
      data: {
        shop: TEST_SHOP,
        questionId: question2.id,
        identifier: TEST_CUSTOMER_EMAIL,
      },
    });
    console.log(`✅ Created vote: ${vote1.id}`);

    // Create test AI log
    console.log('\nCreating test AI interaction...');
    const aiLog1 = await prisma.aILog.create({
      data: {
        shop: TEST_SHOP,
        productId: TEST_PRODUCT_ID,
        customerQuestion: `Question from ${TEST_CUSTOMER_EMAIL}: Can this be washed in a machine?`,
        aiAnswer: 'Yes, this product is machine washable on a gentle cycle.',
        vote: 1,
        askedHuman: false,
      },
    });
    console.log(`✅ Created AI log: ${aiLog1.id}`);

    console.log('\n✨ Test data seeded successfully!');
    console.log(`\n📧 Test customer email: ${TEST_CUSTOMER_EMAIL}`);
    console.log(`🏪 Test shop: ${TEST_SHOP}`);
    console.log('\nYou can now test GDPR webhooks with this data:');
    console.log('1. Go to http://localhost:60713/app/gdpr-test');
    console.log(`2. Enter email: ${TEST_CUSTOMER_EMAIL}`);
    console.log('3. Click "Test Data Request" or "Test Customer Redact"');
    console.log('\n---\n');
    console.log('Summary of created data:');
    console.log(`- Questions: 3`);
    console.log(`- Answers: 1`);
    console.log(`- Votes: 1`);
    console.log(`- AI Interactions: 1`);
  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Check if we should clean up first
const shouldCleanup = process.argv.includes('--clean');

async function cleanup() {
  console.log('🧹 Cleaning up existing test data...\n');

  // Delete existing test data
  await prisma.voteLog.deleteMany({
    where: {
      identifier: TEST_CUSTOMER_EMAIL,
    },
  });

  await prisma.answer.deleteMany({
    where: {
      authorEmail: TEST_CUSTOMER_EMAIL,
    },
  });

  await prisma.question.deleteMany({
    where: {
      customerEmail: TEST_CUSTOMER_EMAIL,
    },
  });

  await prisma.aILog.deleteMany({
    where: {
      customerQuestion: {
        contains: TEST_CUSTOMER_EMAIL,
      },
    },
  });

  console.log('✅ Cleanup complete\n');
}

async function main() {
  if (shouldCleanup) {
    await cleanup();
  }
  await seedTestData();
}

main();
