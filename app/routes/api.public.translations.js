import { json } from "@remix-run/node";
import { cors } from "../lib/cors.server.js";
import prisma from "../db.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return cors(request, json({ error: "Missing shop" }, { status: 400 }));
  }

  const translations = await prisma.config.findMany({
    where: { key: { startsWith: `translations.${shop}` } },
  });

  const result = translations.reduce((acc, row) => {
    const key = row.key.replace(`translations.${shop}.`, "");
    acc[key] = row.value;
    return acc;
  }, {});

  return cors(request, json({ translations: result }));
}
