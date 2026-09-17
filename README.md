# AI Product Questions & Answers

An embedded Shopify app that helps merchants collect, manage, answer, and publish product questions. It includes AI-assisted answers, moderation workflows, customer voting, email notifications, CSV import/export, GDPR webhooks, and a theme app extension for the storefront.

Built by [Orivis Dev](https://orivisdev.shop/). Learn more on the [Orivis Dev app page](https://orivisdev.shop/app/ai-product-questions-answers/).

## Features

- Dashboard with activity, status filters, search, and product links
- AI-generated answers and answer feedback
- Published and pending question workflows
- Customer voting and storefront Q&A components
- CSV import/export and configurable email notifications
- Managed Pricing or app-controlled billing modes
- Shopify GraphQL Admin API integration
- Mandatory GDPR compliance webhooks
- Prisma ORM with MySQL

## Tech stack

- Remix, React, and Shopify Polaris
- Shopify App Bridge and GraphQL Admin API
- Prisma and MySQL
- Recharts
- Shopify theme app extension using Liquid

## Requirements

- Node.js and npm
- Shopify CLI
- Shopify Partner account and development store
- MySQL running locally (the default development configuration uses port `3307`)

## Local development

1. Create a `.env` file. Do not commit it:

   ```env
   DATABASE_URL="mysql://user:password@localhost:3307/qa"
   SHOPIFY_API_KEY="your_api_key"
   SHOPIFY_API_SECRET="your_api_secret"
   ```

2. Install dependencies and initialize Prisma:

   ```bash
   npm install
   npx prisma generate
   npx prisma db push
   ```

3. Start the Shopify development server:

   ```bash
   npm run dev
   ```

Open the app from Shopify Admin using the development store. Shopify CLI creates the development tunnel automatically; do not rely on a tunnel URL from a previous run.

## Useful commands

```bash
npm run dev       # Start Shopify app development
npm run build     # Build the Remix app
npm run lint      # Run ESLint
npm run setup     # Generate Prisma client and deploy migrations
```

GDPR test helpers are documented in [GDPR-TESTING.md](./GDPR-TESTING.md). The SQL files in the repository are maintenance scripts for an existing database; review their target database carefully before executing them.

## Project structure

- `app/routes/` — Remix app, API, authentication, billing, and webhook routes
- `app/lib/` — Shopify, Prisma, AI, email, plans, and GDPR server utilities
- `prisma/` — schema and migrations
- `extensions/product-qa/` — storefront theme app extension
- `scripts/` — development data and GDPR testing helpers

## Security

Never commit `.env`, API secrets, database credentials, SMTP credentials, or production data. The Shopify client ID in `shopify.app.toml` is an identifier, not a secret; keep the API secret only in environment variables.

## License

This repository does not currently declare an open-source license. All rights reserved by Orivis Dev unless a license is added.
