# Gemini Code Setup Instructions

Este archivo contiene toda la información necesaria para que Gemini o cualquier asistente AI pueda levantar correctamente el proyecto de Shopify Q&A.

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


## 🌐 Language & Conventions

-   **Code and Database**: All code, comments, file content, and database entries must be written in English.
-   **AI Assistant Chat**: The chat with the AI assistant can be conducted in Spanish.
