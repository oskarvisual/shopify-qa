import { redirect, json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  SubscriptionPlan,
  getBillingPlan,
  normalizePlan,
} from "../lib/plans";

const APP_SUBSCRIPTION_CREATE_MUTATION = `
  mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $test: Boolean!, $lineItems: [AppSubscriptionLineItemInput!]!) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, lineItems: $lineItems) {
      userErrors {
        field
        message
      }
      confirmationUrl
      appSubscription {
        id
        name
      }
    }
  }
`;

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
  await authenticate.admin(request);
  return json({});
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const requestedPlan = normalizePlan(formData.get("plan"));

  if (!requestedPlan || requestedPlan === SubscriptionPlan.FREE) {
    return json({ error: "Missing or invalid plan" }, { status: 400 });
  }

  const billingPlan = getBillingPlan(requestedPlan);
  if (!billingPlan) {
    return json({ error: "Unsupported plan" }, { status: 400 });
  }

  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) {
    console.error("SHOPIFY_APP_URL is not set; cannot create billing URL");
    return json({ error: "App URL is not configured" }, { status: 500 });
  }

  const returnUrl = new URL("/app/billing/confirm", appUrl);
  returnUrl.searchParams.set("plan", requestedPlan);

  const testMode = process.env.NODE_ENV !== "production";
  const mockBilling = process.env.MOCK_BILLING === "true";

  console.log("[BILLING] Creating subscription", {
    plan: requestedPlan,
    billingPlan: billingPlan.name,
    testMode,
    mockBilling,
    shop: session.shop,
  });

  // Mock billing for development (apps without public distribution cannot use Billing API)
  if (testMode && mockBilling) {
    console.log("[BILLING] Using mock billing flow - skipping Shopify API call");
    const mockUrl = new URL("/app/billing/confirm", appUrl);
    mockUrl.searchParams.set("plan", requestedPlan);
    mockUrl.searchParams.set("mock", "true");
    return redirect(mockUrl.toString());
  }

  const variables = {
    name: billingPlan.name,
    returnUrl: returnUrl.toString(),
    test: testMode,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
              interval: billingPlan.interval,
              price: {
              amount: billingPlan.price.toString(),
              currencyCode: billingPlan.currencyCode,
            },
          },
        },
      },
    ],
  };

  console.log("[BILLING] Calling Shopify GraphQL API", { variables });

  const response = await admin.graphql(APP_SUBSCRIPTION_CREATE_MUTATION, { variables });
  const data = await response.json();

  const error = data?.data?.appSubscriptionCreate?.userErrors?.[0]?.message;
  const confirmationUrl = data?.data?.appSubscriptionCreate?.confirmationUrl;

  if (error || !confirmationUrl) {
    console.error("[BILLING] Failed to create app subscription", { error, data });
    return json({ error: error || "Unable to create subscription" }, { status: 500 });
  }

  console.log("[BILLING] Subscription created successfully, redirecting to:", confirmationUrl);
  return redirect(confirmationUrl);
};

export default function BillingPage() {
  return null;
}
