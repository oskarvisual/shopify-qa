export function normalizeShopDomain(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split("?")[0];
}

export function isPermanentShopifyDomain(value) {
  const shop = normalizeShopDomain(value);
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop || "");
}

export function resolvePublicShopDomain(request, fallbackShop) {
  const url = new URL(request.url);
  const candidates = [
    ...url.searchParams.getAll("shop"),
    fallbackShop,
  ];

  const permanentDomain = candidates
    .map(normalizeShopDomain)
    .find(isPermanentShopifyDomain);

  if (permanentDomain) {
    return permanentDomain;
  }

  return normalizeShopDomain(fallbackShop);
}

export async function getAdminShopDomains({ admin, shop }) {
  const domains = new Set();
  const canonicalShop = normalizeShopDomain(shop);
  if (canonicalShop) {
    domains.add(canonicalShop);
  }

  if (!admin) {
    return Array.from(domains);
  }

  try {
    const response = await admin.graphql(`
      query getShopPrimaryDomain {
        shop {
          primaryDomain {
            url
          }
        }
      }
    `);
    const payload = await response.json();
    const primaryDomain = normalizeShopDomain(payload.data?.shop?.primaryDomain?.url);
    if (primaryDomain) {
      domains.add(primaryDomain);
    }
  } catch (error) {
    console.warn("Failed to fetch shop primary domain:", error);
  }

  return Array.from(domains);
}

export function shopDomainWhere(domains) {
  const normalizedDomains = [...new Set(
    (Array.isArray(domains) ? domains : [domains])
      .map(normalizeShopDomain)
      .filter(Boolean)
  )];

  return normalizedDomains.length === 1
    ? normalizedDomains[0]
    : { in: normalizedDomains };
}
