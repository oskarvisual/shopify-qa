import { json } from "@remix-run/node";
import prisma from "../db.server";
import { cors } from "remix-utils/cors";
import { getSubscriptionPlanContext } from "../lib/plans.server";
import { planHasFeature, PlanFeature } from "../lib/plans";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return cors(request, json({ error: "Shop parameter is required" }, { status: 400 }));
  }

  const [aiSettings, planContext] = await Promise.all([
    prisma.aiSetting.findUnique({
      where: { shop },
      select: { aiEnabled: true, aiFrontendEnabled: true },
    }),
    getSubscriptionPlanContext({ shop, sessionPlan: undefined }),
  ]);

  const frontendAiEnabled =
    Boolean(aiSettings?.aiEnabled) &&
    planHasFeature(planContext.features, PlanFeature.FRONTEND_AI) &&
    planHasFeature(planContext.features, PlanFeature.AI_CUSTOMER_SUPPORT);

  return cors(request, json({ aiEnabled: frontendAiEnabled }));
}
