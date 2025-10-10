import { redirect, json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  SubscriptionPlan,
  createSubscriptionPlanConfigKey,
  getBillingPlan,
  normalizePlan,
} from "../lib/plans";

const CURRENT_INSTALLATION_QUERY = `
  query CurrentInstallation {
    currentAppInstallation {
      activeSubscriptions(first: 10) {
        id
        name
        status
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const planParam = normalizePlan(url.searchParams.get("plan"));
  const isMock = url.searchParams.get("mock") === "true";

  console.log("[BILLING CONFIRM] Starting confirmation", {
    plan: planParam,
    isMock,
    url: url.toString(),
  });

  if (!planParam || planParam === SubscriptionPlan.FREE) {
    console.warn("[BILLING CONFIRM] Invalid plan received:", planParam);
    return redirect("/app/settings?upgrade=invalid");
  }

  const billingPlan = getBillingPlan(planParam);
  if (!billingPlan) {
    console.warn("[BILLING CONFIRM] No billing plan found for:", planParam);
    return redirect("/app/settings?upgrade=invalid");
  }

  const { session, admin } = await authenticate.admin(request);
  const { shop } = session;

  try {
    let hasActiveSubscription = false;

    if (isMock) {
      // Mock mode: simulate active subscription
      console.log("[BILLING CONFIRM] Mock mode - simulating active subscription for plan:", planParam);
      hasActiveSubscription = true;
    } else {
      // Real mode: check actual subscription status
      console.log("[BILLING CONFIRM] Checking actual subscription status via GraphQL");
      const installationResponse = await admin.graphql(CURRENT_INSTALLATION_QUERY);
      const installationData = await installationResponse.json();
      const activeSubscriptions = installationData?.data?.currentAppInstallation?.activeSubscriptions || [];

      console.log("[BILLING CONFIRM] Active subscriptions:", activeSubscriptions);

      hasActiveSubscription = activeSubscriptions.some(
        (subscription) =>
          subscription?.name === billingPlan.name && subscription?.status === "ACTIVE"
      );

      if (!hasActiveSubscription) {
        console.warn("[BILLING CONFIRM] No active subscription detected for plan:", billingPlan.name);
      }
    }

    // Save the plan to the database
    console.log("[BILLING CONFIRM] Saving plan to database:", { shop, plan: planParam });
    await prisma.config.upsert({
      where: { key: createSubscriptionPlanConfigKey(shop) },
      update: { value: planParam },
      create: { key: createSubscriptionPlanConfigKey(shop), value: planParam },
    });

    const status = hasActiveSubscription ? "success" : "pending";
    console.log("[BILLING CONFIRM] Confirmation complete, redirecting with status:", status);

    return redirect(`/app/settings?upgrade=${status}&plan=${planParam}`);
  } catch (error) {
    console.error("[BILLING CONFIRM] Failed to confirm billing:", error);
    return redirect("/app/settings?upgrade=error");
  }
};

export default function BillingConfirmPage() {
  return null;
}
