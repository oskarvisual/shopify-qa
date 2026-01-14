import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createSubscriptionPlanConfigKey, normalizePlan } from "../lib/plans";

const ACTIVE_SUBSCRIPTIONS_QUERY = `
  query GetActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        lineItems {
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                price {
                  amount
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * This route syncs the merchant's plan from Shopify's billing system
 * It's called when merchants return from Shopify's pricing page (Managed Pricing)
 */
export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const { shop } = session;

  try {
    console.log("[SYNC PLAN] Syncing plan for shop:", shop);

    // Get active subscriptions from Shopify
    const response = await admin.graphql(ACTIVE_SUBSCRIPTIONS_QUERY);
    const data = await response.json();

    const activeSubscriptions = data?.data?.currentAppInstallation?.activeSubscriptions || [];

    console.log("[SYNC PLAN] Active subscriptions:", JSON.stringify(activeSubscriptions, null, 2));

    // Determine the plan based on active subscriptions
    let detectedPlan = "free";

    if (activeSubscriptions.length > 0) {
      const subscription = activeSubscriptions[0];
      const subscriptionName = subscription.name?.toLowerCase() || "";

      // Map subscription name to plan
      if (subscriptionName.includes("ultra")) {
        detectedPlan = "ultra";
      } else if (subscriptionName.includes("pro")) {
        detectedPlan = "pro";
      } else {
        // Try to detect by price
        const price = parseFloat(
          subscription.lineItems?.[0]?.plan?.pricingDetails?.price?.amount || "0"
        );

        if (price >= 40) {
          detectedPlan = "ultra";
        } else if (price >= 15) {
          detectedPlan = "pro";
        }
      }
    }

    const normalizedPlan = normalizePlan(detectedPlan);

    console.log("[SYNC PLAN] Detected plan:", normalizedPlan);

    // Save to database
    await prisma.config.upsert({
      where: { key: createSubscriptionPlanConfigKey(shop) },
      update: { value: normalizedPlan },
      create: { key: createSubscriptionPlanConfigKey(shop), value: normalizedPlan },
    });

    console.log("[SYNC PLAN] Plan saved to database");

    // Redirect to settings with success message
    return redirect(`/app/settings?plan_updated=true&plan=${normalizedPlan}`);
  } catch (error) {
    console.error("[SYNC PLAN] Error syncing plan:", error);
    return redirect("/app/settings?plan_updated=error");
  }
};

export default function SyncPlanPage() {
  return null;
}
