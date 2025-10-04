import { json } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    const response = json({ error: "Missing required shop parameter" }, { status: 400 });
    return cors(request, response);
  }

  try {
    const config = await prisma.config.findUnique({ where: { key: `translations.${shop}` } });
    let translations = {};

    if (config?.value) {
      try {
        translations = JSON.parse(config.value);
      } catch (error) {
        console.warn(`Failed to parse translation settings for ${shop}:`, error);
      }
    }

    const response = json({ translations });
    return cors(request, response);
  } catch (error) {
    console.error("Error loading translations:", error);
    const errorResponse = json({ error: "Failed to load translations" }, { status: 500 });
    return cors(request, errorResponse);
  }
};

export const action = loader;
