import { json } from "@remix-run/node";
import prisma from "../db.server";
import { cors } from "../lib/cors.server.js";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    const response = json({ error: "Missing shop" }, { status: 400 });
    return cors(request, response);
  }

  const settings = await prisma.aiSetting.findUnique({ where: { shop } });

  const response = json({
    aiEnabled: Boolean(settings?.aiEnabled),
    aiFrontendEnabled: Boolean(settings?.aiFrontendEnabled),
  });

  return cors(request, response);
}
