# Claude Code Setup Instructions

Este archivo contiene toda la información necesaria para que Claude o cualquier asistente AI pueda levantar correctamente el proyecto de Shopify Q&A.

## 🚀 Comandos para iniciar el proyecto

### Comando principal
```bash
shopify app dev
```

### Comandos de setup inicial (si es primera vez)
```bash
# 1. Instalar dependencias
npm install

# 2. Instalar Recharts para gráficos (si no está)
npm install recharts --legacy-peer-deps

# 3. Generar cliente Prisma
npx prisma generate

# 4. Aplicar esquema a base de datos
npx prisma db push

# 5. Iniciar aplicación
shopify app dev
```

## 📋 Requisitos previos

### 1. MySQL debe estar ejecutándose
```bash
# macOS con Homebrew
brew services start mysql

# O verificar que esté corriendo
brew services list | grep mysql
```

### 2. Variables de entorno (.env)
El archivo `.env` debe existir con:
```env
DATABASE_URL="mysql://user:password@localhost:3307/qa"
SHOPIFY_API_KEY="tu_api_key"
SHOPIFY_API_SECRET="tu_api_secret"
```

### 3. Archivos importantes del proyecto
- **Base de datos**: MySQL con Prisma ORM
- **Framework**: Remix con React
- **UI**: Shopify Polaris
- **Gráficos**: Recharts
- **Extensiones**: Theme app extensions en Liquid

## ⚠️ Troubleshooting común

### Puerto ocupado o múltiples procesos
```bash
# Ver procesos Shopify corriendo
ps aux | grep shopify

# Matar todos los procesos Shopify
pkill -f "shopify app dev"

# Matar procesos en puerto específico
lsof -ti:60713 | xargs kill -9
```

### Error de Recharts
```bash
# Si hay conflictos de dependencias
npm install recharts --legacy-peer-deps
```

### Errores de Prisma
```bash
# Regenerar cliente
npx prisma generate

# Reset completo de DB (cuidado: borra datos)
npx prisma db push --force-reset
```

## 🌐 URLs del proyecto

Una vez iniciado `shopify app dev`, el proyecto genera:

- **Local**: `http://localhost:60713/` (desarrollo local)
- **Túnel público**: `https://[random].trycloudflare.com` (acceso desde Shopify)
- **Tienda de desarrollo**: `tests-products-questions-and-answers.myshopify.com`

### Acceso correcto
1. **Ir a Shopify Admin** → Apps → Tu App
2. **NO acceder directamente** a las URLs del túnel
3. Si aparece login, usar: `tests-products-questions-and-answers.myshopify.com`

## 📂 Estructura del proyecto

### Rutas principales
- `/app` - Dashboard principal con gráfico y tabla de preguntas
- `/app/questions/new` - Crear nueva pregunta
- `/app/questions/[id]` - Ver/editar pregunta específica
- `/app/import-export` - Importar/exportar preguntas CSV

### Archivos clave
- `app/routes/app._index.jsx` - Dashboard principal
- `app/routes/app.import-export.jsx` - Funcionalidad import/export
- `prisma/schema.prisma` - Esquema de base de datos
- `extensions/product-qa/` - Extensiones de tema de Shopify

## 🛠️ Características implementadas

### Dashboard
- ✅ Gráfico de actividad de 30 días (Recharts)
- ✅ Estadísticas (preguntas publicadas, pendientes, respuestas)
- ✅ Tabla de preguntas con filtros (All/Published/Pending)
- ✅ Búsqueda en tiempo real
- ✅ Links a productos de Shopify

### Import/Export
- ✅ Exportación CSV completa
- ⚠️ Importación CSV (funcionalidad básica, pendiente validaciones completas)

### Extensiones de tema
- ✅ Bloque de preguntas y respuestas para mostrar en productos
- ✅ Formulario para enviar preguntas desde la tienda

## 🔧 Desarrollo activo

### Comandos útiles durante desarrollo
```bash
# Ver logs en tiempo real
shopify app dev

# Regenerar Prisma si cambias el schema
npx prisma generate && npx prisma db push

# Limpiar node_modules si hay problemas
rm -rf node_modules && npm install
```

### Notas importantes
- El túnel de Cloudflare se regenera automáticamente
- Las sesiones de Shopify pueden expirar, es normal volver a hacer login
- Siempre acceder desde el Admin de Shopify, no directamente a URLs

## 📝 Para otros asistentes AI

Al trabajar con este proyecto:

1. **SIEMPRE** verificar que MySQL esté corriendo antes de `shopify app dev`
2. **NO ejecutar** múltiples instancias de `shopify app dev` simultáneamente
3. **USAR** `--legacy-peer-deps` si instalas nuevas dependencias
4. **VERIFICAR** que existe el archivo `.env` con las variables necesarias
5. **RECORDAR** que las URLs de túnel cambian en cada reinicio
6. **ACCEDER** siempre desde Shopify Admin, no directamente a las URLs

## 🎯 Comando de inicio rápido completo

```bash
# Limpiar procesos anteriores
pkill -f "shopify app dev"

# Verificar MySQL
brew services start mysql

# Instalar dependencias si es necesario
npm install

# Generar Prisma
npx prisma generate

# Iniciar aplicación
shopify app dev
```

Una vez que aparezca la URL del túnel, acceder desde el Admin de Shopify.


## 🔒 GDPR Webhooks (Mandatory for Shopify Apps)

The app implements three mandatory GDPR compliance webhooks required for all Shopify App Store apps:

### Webhooks Implemented
- `customers/data_request` - Gathers and sends customer data via email
- `customers/redact` - Anonymizes customer personal data
- `shop/redact` - Deletes all shop data 48 hours after app uninstall

### Configuration
GDPR webhooks are configured in `shopify.app.toml` using `compliance_topics` (NOT regular `topics`):

```toml
[[webhooks.subscriptions]]
compliance_topics = ["customers/data_request"]
uri = "/webhooks/customers/data_request"

[[webhooks.subscriptions]]
compliance_topics = ["customers/redact"]
uri = "/webhooks/customers/redact"

[[webhooks.subscriptions]]
compliance_topics = ["shop/redact"]
uri = "/webhooks/shop/redact"
```

**Key differences from regular webhooks:**
- Use `compliance_topics` instead of `topics`
- Each compliance topic has its own dedicated URI endpoint
- Automatically registered and verified by Shopify during app review

All webhook handlers automatically verify HMAC signatures for security.

### Testing (Development Only)
```bash
# Create test data
node scripts/seed-test-data.js

# Access test UI (development only)
# Go to your app → /gdpr-test

# Or use CLI script
node scripts/test-gdpr-webhook.js data_request
```

**IMPORTANT:** All testing tools are protected and only work when `NODE_ENV` is NOT set to `production`. See `GDPR-TESTING.md` for complete documentation.

### Files
- `app/routes/webhooks.customers.data_request.jsx` - Data request handler
- `app/routes/webhooks.customers.redact.jsx` - Customer redaction
- `app/routes/webhooks.shop.redact.jsx` - Shop redaction
- `app/lib/gdpr.server.js` - GDPR helper functions
- `app/routes/app.gdpr-test.jsx` - Testing UI (dev only)
- `GDPR-TESTING.md` - Complete testing guide

## 💳 Billing & Subscription Management

This app supports **two billing modes** that can be switched via environment variable:

### Billing Modes

#### 1. **Managed Pricing** (Default - `USE_MANAGED_PRICING=true`)
- Plans are configured in **Shopify Partners Dashboard** → Distribution → Pricing
- Shopify handles all billing automatically
- Merchants select plans directly in Shopify Admin
- **Pros**: Simpler setup, plans visible in App Store, automatic billing
- **Cons**: Less programmatic control, merchants leave app to upgrade

**Current Configuration:**
```
Public plans in Partner Dashboard:
- Free ($0/month)
- Pro ($15/month)
- Ultra ($40/month)
```

**Upgrade Flow:**
1. Merchant clicks "Upgrade" button in Settings
2. Banner appears with link to Shopify billing page
3. Merchant visits Shopify Admin → Charges → Pricing Plans
4. Selects and confirms new plan
5. Returns to app and clicks "Sync my plan"
6. App detects new plan via GraphQL and updates database

#### 2. **App-Controlled Billing** (`USE_MANAGED_PRICING=false`)
- App handles billing programmatically via Billing API
- Uses `appSubscriptionCreate` GraphQL mutation
- Merchants upgrade within the app (better UX)
- **Pros**: Full programmatic control, better UX, can offer trials
- **Cons**: Need to delete Partner Dashboard plans, requires `write_payments` scope

**To Switch to App-Controlled:**
1. Go to Shopify Partners Dashboard → Your App → Distribution → Pricing
2. Delete all public plans
3. Set `USE_MANAGED_PRICING=false` in `.env`
4. Redeploy the app
5. Upgrade buttons will use Billing API

### Files

- `app/routes/app.billing.jsx` - Handles upgrade requests (detects billing mode)
- `app/routes/app.billing.confirm.jsx` - Confirms subscription after Shopify redirect
- `app/routes/app.sync-plan.jsx` - Syncs plan from Shopify (Managed Pricing only)
- `app/lib/plans.js` - Plan definitions and feature flags
- `app/lib/plans.server.js` - Server-side plan detection

### Environment Variables

```env
# Set to "true" for Managed Pricing, "false" for App-Controlled
USE_MANAGED_PRICING=true

# For development only (skips Shopify API calls)
MOCK_BILLING=false
```

### Downgrades and Cancellations

- **Managed Pricing**: Handled automatically by Shopify
- **App-Controlled**: Merchants cancel via Shopify Admin → Apps → Manage

Both modes update the plan in the database on next app visit.

## 📡 REST to GraphQL Migration

**IMPORTANT:** This app uses GraphQL API exclusively. REST Admin API for products/variants is deprecated and will be unsupported after 2025-04-01.

### GraphQL Configuration
- API version: `2025-01` (defined in `shopify.server.js`)
- `removeRest: true` flag prevents accidental REST API usage
- All product, collection, shop, and shipping queries use GraphQL

### Key Migrations Completed
- ✅ Product details: `GET /products/{id}.json` → GraphQL `product(id:)` query
- ✅ Collections: `GET /collections.json?product_id=` → GraphQL `inCollections` field
- ✅ Shop info: `GET /shop.json` → GraphQL `shop` query
- ✅ Shipping zones: `GET /shipping_zones.json` → GraphQL `deliveryProfiles` query

### Files Using GraphQL
- `app/routes/api.public.questions.js` - Public storefront API
- `app/routes/app.questions.new.jsx` - Admin question creation
- `app/lib/store-context.server.js` - Store context for AI

## 🌐 Language & Conventions

-   **Code and Database**: All code, comments, file content, and database entries must be written in English.
-   **AI Assistant Chat**: The chat with the AI assistant can be conducted in Spanish.
