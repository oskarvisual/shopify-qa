import prisma from "../db.server";

const SHOP_INFO_QUERY = `
  query getShopInfo {
    shop {
      name
      primaryDomain {
        url
      }
      currencyCode
      enabledPresentmentCurrencies
      shipsToCountries
      paymentSettings {
        supportedDigitalWallets
        enabledPresentmentCurrencies
      }
    }
  }
`;

async function findLatestSession(shop) {
  try {
    return await prisma.session.findFirst({
      where: { shop },
      orderBy: { id: "desc" },
    });
  } catch (error) {
    console.warn("Failed to find session for shop context:", error);
    return null;
  }
}

function normaliseShopInfo(data = {}) {
  return {
    name: data.name || null,
    primaryDomain: data.primaryDomain?.url || null,
    currencyCode: data.currencyCode || null,
    presentmentCurrencies: data.enabledPresentmentCurrencies || [],
    shipsToCountries: data.shipsToCountries || [],
    paymentSettings: {
      supportedDigitalWallets: data.paymentSettings?.supportedDigitalWallets || [],
      presentmentCurrencies: data.paymentSettings?.enabledPresentmentCurrencies || [],
    },
  };
}

function normaliseShippingZones(shippingZones = []) {
  return shippingZones.map((zone) => ({
    name: zone.name || null,
    countries: (zone.countries || []).map((country) => country.name).filter(Boolean),
    priceBasedRates: (zone.price_based_shipping_rates || []).map((rate) => ({
      name: rate.name || null,
      minOrderSubtotal: rate.min_order_subtotal ? Number(rate.min_order_subtotal) : null,
      maxOrderSubtotal: rate.max_order_subtotal ? Number(rate.max_order_subtotal) : null,
      price: rate.price ? Number(rate.price) : null,
      currency: rate.currency || null,
    })),
    weightBasedRates: (zone.weight_based_shipping_rates || []).map((rate) => ({
      name: rate.name || null,
      minWeight: rate.min_weight ? Number(rate.min_weight) : null,
      maxWeight: rate.max_weight ? Number(rate.max_weight) : null,
      price: rate.price ? Number(rate.price) : null,
      currency: rate.currency || null,
    })),
  }));
}

async function fetchShippingZones({ shop, accessToken }) {
  if (!shop || !accessToken) {
    return [];
  }

  try {
    const response = await fetch(`https://${shop}/admin/api/2023-10/shipping_zones.json`, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.warn(
        `Failed to fetch shipping zones for ${shop}: ${response.status} ${response.statusText}`,
      );
      return [];
    }

    const data = await response.json();
    return normaliseShippingZones(data.shipping_zones || []);
  } catch (error) {
    console.warn("Error fetching shipping zones:", error);
    return [];
  }
}

export async function getStoreContext({ shop, admin }) {
  if (!shop || !admin) {
    return null;
  }

  let shopInfo = {};
  try {
    const response = await admin.graphql(SHOP_INFO_QUERY);
    const payload = await response.json();
    if (payload?.data?.shop) {
      shopInfo = normaliseShopInfo(payload.data.shop);
    }
  } catch (error) {
    console.warn("Failed to fetch shop info for AI context:", error);
  }

  const session = await findLatestSession(shop);
  const accessToken = session?.accessToken;
  const shippingZones = await fetchShippingZones({ shop, accessToken });

  if (shippingZones.length > 0) {
    shopInfo.shippingZones = shippingZones;
  }

  return shopInfo;
}
