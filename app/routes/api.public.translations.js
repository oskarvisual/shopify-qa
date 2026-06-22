import { json } from "@remix-run/node";
import { cors } from "../lib/cors.server.js";
import prisma from "../db.server";
import { resolvePublicShopDomain } from "../lib/shop-domain.server.js";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = resolvePublicShopDomain(request, url.searchParams.get("shop"));

  if (!shop) {
    return cors(request, json({ error: "Missing shop" }, { status: 400 }));
  }

  const baseKey = `translations.${shop}`;
  let result = {};

  const bundledTranslations = await prisma.config.findUnique({
    where: { key: baseKey },
  });

  if (bundledTranslations?.value) {
    try {
      const parsed = JSON.parse(bundledTranslations.value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        result = parsed;
      }
    } catch (error) {
      console.warn("Failed to parse bundled translations config", error);
    }
  }

  if (Object.keys(result).length === 0) {
    const translationEntries = await prisma.config.findMany({
      where: { key: { startsWith: `${baseKey}.` } },
    });

    result = translationEntries.reduce((acc, row) => {
      const key = row.key.replace(`${baseKey}.`, "");
      if (!key) return acc;

      let value = row.value;
      if (typeof value === "string") {
        try {
          const parsedValue = JSON.parse(value);
          if (typeof parsedValue === "string") {
            value = parsedValue;
          }
        } catch {
          // Leave value as-is if it is not JSON encoded.
        }
      }
      acc[key] = value;
      return acc;
    }, {});
  }

  return cors(request, json({ translations: result }));
}
