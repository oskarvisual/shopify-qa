const AUTOMATIONS_APP_ID =
  process.env.AUTOMATIONS_APP_ID ||
  process.env.SHOPIFY_APP_HANDLE ||
  process.env.SHOPIFY_API_KEY ||
  "product-questions-and-answers";

const AUTOMATIONS_GLOBAL_TOKEN = process.env.AUTOMATIONS_TOKEN?.trim() || null;

function buildAuthHeaders(token) {
  const headers = { "Content-Type": "application/json" };
  const resolvedToken = token?.trim() || AUTOMATIONS_GLOBAL_TOKEN;
  if (resolvedToken) {
    headers.Authorization = `Bearer ${resolvedToken}`;
  }
  return headers;
}

export async function dispatchWebhookAutomation({
  shop,
  topic,
  target,
  payload,
  method = "POST",
  headers = {},
  meta = {},
}) {
  const endpoint = process.env.AUTOMATIONS_WEBHOOK_URL?.trim();
  if (!endpoint) {
    console.warn("AUTOMATIONS_WEBHOOK_URL env var is not set; skipping webhook automation dispatch.");
    return;
  }

  const automationPayload = {
    appId: AUTOMATIONS_APP_ID,
    shop,
    topic,
    target: {
      url: target,
      method,
      headers,
      body: payload,
    },
    meta,
    dispatchedAt: new Date().toISOString(),
  };

  try {
    const requestBody = JSON.stringify(automationPayload);
    const requestHeaders = buildAuthHeaders();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: requestHeaders,
      body: requestBody,
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "Unable to read response body");
      console.error("Webhook Automation Request Failed:");
      console.error("  URL:", endpoint);
      console.error("  Status:", response.status, response.statusText);
      console.error("  Shop:", shop);
      console.error("  Topic:", topic);
      console.error("  Headers:", JSON.stringify(requestHeaders, null, 2));
      console.error("  Request Body:", requestBody.substring(0, 500) + (requestBody.length > 500 ? "..." : ""));
      console.error("  Response:", responseText.substring(0, 500) + (responseText.length > 500 ? "..." : ""));
    }

    return response;
  } catch (error) {
    console.error("Failed to dispatch webhook automation:", error.message);
    console.error("  URL:", endpoint);
    console.error("  Shop:", shop);
    console.error("  Topic:", topic);
    console.error("  Error Stack:", error.stack);
    return null;
  }
}

export async function dispatchEmailAutomation({
  shop,
  mail,
  emailSettings,
  defaultSmtp,
  meta = {},
}) {
  const endpoint = process.env.AUTOMATIONS_EMAIL_URL?.trim();
  if (!endpoint) {
    console.warn("AUTOMATIONS_EMAIL_URL env var is not set; skipping email automation dispatch.");
    return;
  }

  console.log("Dispatching email automation:", {
    url: endpoint,
    shop,
    to: mail?.to ?? null,
    event: meta?.event ?? null,
  });

  const automationPayload = {
    appId: AUTOMATIONS_APP_ID,
    shop,
    mail,
    emailSettings,
    defaultSmtp,
    meta,
    dispatchedAt: new Date().toISOString(),
  };

  try {
    const requestBody = JSON.stringify(automationPayload);
    const requestHeaders = buildAuthHeaders();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: requestHeaders,
      body: requestBody,
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "Unable to read response body");
      console.error("Email Automation Request Failed:");
      console.error("  URL:", endpoint);
      console.error("  Status:", response.status, response.statusText);
      console.error("  Shop:", shop);
      console.error("  Mail To:", mail?.to);
      console.error("  Mail Subject:", mail?.subject);
      console.error("  Headers:", JSON.stringify(requestHeaders, null, 2));
      console.error("  Request Body:", requestBody.substring(0, 500) + (requestBody.length > 500 ? "..." : ""));
      console.error("  Response:", responseText.substring(0, 500) + (responseText.length > 500 ? "..." : ""));
    }

    return response;
  } catch (error) {
    console.error("Failed to dispatch email automation:", error.message);
    console.error("  URL:", endpoint);
    console.error("  Shop:", shop);
    console.error("  Mail To:", mail?.to);
    console.error("  Error Stack:", error.stack);
    return null;
  }
}
