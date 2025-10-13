import { json } from "@remix-run/node";
import { cors } from "../lib/cors.server.js";
import prisma from "../db.server";
import { getSubscriptionPlanContext } from "../lib/plans.server";
import { planHasFeature, PlanFeature } from "../lib/plans";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    const response = json({ error: "Missing required shop parameter" }, { status: 400 });
    return cors(request, response);
  }

  try {
    // Get plan context for the shop
    const planContext = await getSubscriptionPlanContext({ shop });

    // Check if the shop's plan has widget branding (FREE plan = true, PRO/ULTRA = false)
    const showBranding = planHasFeature(planContext.features, PlanFeature.WIDGET_BRANDING);

    // Get branding configuration
    const brandingName = planContext.branding.name || "Product Q&A";
    const brandingUrl = planContext.branding.url || "https://apps.shopify.com/product-questions-and-answers";

    const response = json({
      showBranding,
      brandingName,
      brandingUrl,
      plan: planContext.plan
    });

    return cors(request, response);
  } catch (error) {
    console.error("Error loading branding info:", error);
    // Default to showing branding on error (safe default)
    const errorResponse = json({
      showBranding: true,
      brandingName: "Product Q&A",
      brandingUrl: "https://apps.shopify.com/product-questions-and-answers",
      plan: "free"
    }, { status: 500 });
    return cors(request, errorResponse);
  }
};
