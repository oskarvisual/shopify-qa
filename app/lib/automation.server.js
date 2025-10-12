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
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildAuthHeaders(),
      body: JSON.stringify(automationPayload),
    });
    return response;
  } catch (error) {
    console.error("Failed to dispatch webhook automation:", error);
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
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildAuthHeaders(),
      body: JSON.stringify(automationPayload),
    });
    return response;
  } catch (error) {
    console.error("Failed to dispatch email automation:", error);
    return null;
  }
}
