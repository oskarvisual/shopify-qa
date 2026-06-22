import { json } from "@remix-run/node";
import { cors } from "../lib/cors.server.js";
import { getSubscriptionPlanContext } from "../lib/plans.server";
import { planHasFeature, PlanFeature } from "../lib/plans";
import { resolvePublicShopDomain } from "../lib/shop-domain.server.js";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = resolvePublicShopDomain(request, url.searchParams.get("shop"));

  if (!shop) {
    const response = json({ error: "Missing required shop parameter" }, { status: 400 });
    return cors(request, response);
  }

  try {
    const planContext = await getSubscriptionPlanContext({ shop });
    const showBranding = planHasFeature(planContext.features, PlanFeature.WIDGET_BRANDING);

    const brandingName = planContext.branding.name || "Product Q&A";
    const brandingUrl = planContext.branding.url || "https://apps.shopify.com/product-questions-and-answers";

    const response = json({
      showBranding,
      brandingName,
      brandingUrl,
      plan: planContext.plan,
    });

    return cors(request, response);
  } catch (error) {
    console.error("Error loading branding info:", error);
    const errorResponse = json({
      showBranding: true,
      brandingName: "Product Q&A",
      brandingUrl: "https://apps.shopify.com/product-questions-and-answers",
      plan: "free",
    }, { status: 500 });
    return cors(request, errorResponse);
  }
}
