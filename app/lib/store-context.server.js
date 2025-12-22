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
      }
    }
  }
`;

const DELIVERY_PROFILES_QUERY = `
  query getDeliveryProfiles {
    deliveryProfiles(first: 10) {
      edges {
        node {
          name
          profileLocationGroups {
            locationGroup {
              locations(first: 50) {
                edges {
                  node {
                    name
                  }
                }
              }
            }
            locationGroupZones(first: 50) {
              edges {
                node {
                  zone {
                    name
                    countries {
                      code {
                        countryCode
                      }
                      name
                    }
                  }
                  methodDefinitions(first: 50) {
                    edges {
                      node {
                        name
                        rateProvider {
                          ... on DeliveryRateDefinition {
                            price {
                              amount
                              currencyCode
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

function normaliseShopInfo(data = {}) {
  return {
    name: data.name || null,
    primaryDomain: data.primaryDomain?.url || null,
    currencyCode: data.currencyCode || null,
    presentmentCurrencies: data.enabledPresentmentCurrencies || [],
    shipsToCountries: data.shipsToCountries || [],
    paymentSettings: {
      supportedDigitalWallets: data.paymentSettings?.supportedDigitalWallets || [],
    },
  };
}

function normaliseDeliveryProfiles(deliveryProfiles = []) {
  const zones = [];

  for (const profile of deliveryProfiles) {
    for (const locationGroup of profile.profileLocationGroups || []) {
      for (const zoneEdge of locationGroup.locationGroupZones?.edges || []) {
        const zone = zoneEdge.node?.zone;
        const methods = zoneEdge.node?.methodDefinitions?.edges || [];

        if (zone) {
          zones.push({
            name: zone.name || null,
            countries: (zone.countries || []).map((country) => country.name).filter(Boolean),
            rates: methods.map((methodEdge) => {
              const method = methodEdge.node;
              const price = method.rateProvider?.price;
              return {
                name: method.name || null,
                price: price?.amount ? Number(price.amount) : null,
                currency: price?.currencyCode || null,
              };
            }).filter((rate) => rate.name),
          });
        }
      }
    }
  }

  return zones;
}

async function fetchDeliveryProfiles({ admin }) {
  if (!admin) {
    return [];
  }

  try {
    const response = await admin.graphql(DELIVERY_PROFILES_QUERY);
    const payload = await response.json();

    if (!payload?.data?.deliveryProfiles?.edges) {
      return [];
    }

    const profiles = payload.data.deliveryProfiles.edges.map((edge) => edge.node);
    return normaliseDeliveryProfiles(profiles);
  } catch (error) {
    console.warn("Error fetching delivery profiles:", error);
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

  const shippingZones = await fetchDeliveryProfiles({ admin });

  if (shippingZones.length > 0) {
    shopInfo.shippingZones = shippingZones;
  }

  return shopInfo;
}
