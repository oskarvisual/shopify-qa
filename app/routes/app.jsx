import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const aiSettings = await prisma.aiSetting.findUnique({
    where: { shop },
    select: { aiEnabled: true },
  });

  return json({ 
    apiKey: process.env.SHOPIFY_API_KEY || "",
    aiSettings: aiSettings || { aiEnabled: false },
  });
};

export default function App() {
  const { apiKey, aiSettings } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">Dashboard</Link>
        <Link to="/app/questions-list">Questions & Answers</Link>
        {aiSettings?.aiEnabled && (
          <Link to="/app/ai-logs">AI Logs</Link>
        )}
        <Link to="/app/import-export">Import/Export</Link>
        <Link to="/app/settings">Settings</Link>
      </NavMenu>
      <Outlet />
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