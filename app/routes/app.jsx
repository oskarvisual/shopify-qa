import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PlanProvider } from "../lib/plan-context";
import { PlanFeature, planHasFeature } from "../lib/plans";
import { getSubscriptionPlanContext } from "../lib/plans.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop, subscriptionPlan } = session;

  const aiSettings = await prisma.aiSetting.findUnique({
    where: { shop },
    select: { aiEnabled: true },
  });

  const planContext = await getSubscriptionPlanContext({
    shop,
    sessionPlan: subscriptionPlan,
  });

  return json({ 
    apiKey: process.env.SHOPIFY_API_KEY || "",
    aiSettings: aiSettings || { aiEnabled: false },
    planContext,
  });
};

export default function App() {
  const { apiKey, aiSettings, planContext } = useLoaderData();
  const { features } = planContext;
  const aiEnabledForPlan = planHasFeature(features, PlanFeature.ADMIN_AI) && aiSettings?.aiEnabled;

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <PlanProvider value={planContext}>
        <NavMenu>
          <Link to="/app" rel="home">Dashboard</Link>
          <Link to="/app/questions-list">Questions & Answers</Link>
          {aiEnabledForPlan && planHasFeature(features, PlanFeature.PAGE_AI_LOGS) && (
            <Link to="/app/ai-logs">AI Logs</Link>
          )}
          {planHasFeature(features, PlanFeature.PAGE_IMPORT_EXPORT) && (
            <Link to="/app/import-export">Import/Export</Link>
          )}
          <Link to="/app/settings">Settings</Link>
        </NavMenu>
        <Outlet context={{ aiEnabledForPlan }} />
      </PlanProvider>
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
