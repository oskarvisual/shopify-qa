import { json } from "@remix-run/node";
import prisma from "../db.server";
import { cors } from "remix-utils/cors";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return cors(request, json({ error: "Shop parameter is required" }, { status: 400 }));
  }

  const aiSettings = await prisma.aiSetting.findUnique({
    where: { shop },
    select: { aiEnabled: true },
  });

  return cors(request, json(aiSettings || { aiEnabled: false }));
}
