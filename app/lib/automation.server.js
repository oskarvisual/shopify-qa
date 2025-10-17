import { createTransport } from "nodemailer";

const AUTOMATIONS_APP_ID =
  process.env.AUTOMATIONS_APP_ID ||
  process.env.SHOPIFY_APP_HANDLE ||
  process.env.SHOPIFY_API_KEY ||
  "product-questions-and-answers";

const AUTOMATIONS_GLOBAL_TOKEN = process.env.AUTOMATIONS_TOKEN?.trim() || null;

function hasCustomSmtpConfig(emailSettings) {
  if (!emailSettings || emailSettings.smtpProvider !== "CUSTOM") {
    return false;
  }

  const { smtpHost, smtpPort, smtpUser, smtpPass } = emailSettings;

  if (!smtpHost || typeof smtpHost !== "string" || smtpHost.trim() === "") {
    return false;
  }

  if (smtpPort === null || smtpPort === undefined || Number.isNaN(Number(smtpPort))) {
    return false;
  }

  if (!smtpUser || typeof smtpUser !== "string" || smtpUser.trim() === "") {
    return false;
  }

  if (!smtpPass || typeof smtpPass !== "string" || smtpPass.trim() === "") {
    return false;
  }

  return true;
}

function resolveSmtpSecureFlag(emailSettings) {
  if (emailSettings?.smtpSecure === undefined || emailSettings?.smtpSecure === null) {
    return true;
  }
  return Boolean(emailSettings.smtpSecure);
}

async function dispatchViaCustomSmtp({ shop, mail, emailSettings, meta }) {
  const host = emailSettings.smtpHost;
  const port = Number(emailSettings.smtpPort);
  const user = emailSettings.smtpUser;
  const pass = emailSettings.smtpPass;
  const secure = resolveSmtpSecureFlag(emailSettings);

  const transporter = createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  try {
    if (!mail || Object.keys(mail).length === 0) {
      await transporter.verify();
      console.log("Custom SMTP connection verified", {
        shop,
        host,
        port,
        secure,
        event: meta?.event || null,
      });

      return {
        ok: true,
        transport: "smtp",
        status: "verified",
        host,
        port,
        secure,
      };
    }

    const fromAddress = user;
    const message = {
      ...mail,
      from: fromAddress,
    };

    const info = await transporter.sendMail(message);

    const rejected = Array.isArray(info.rejected) ? info.rejected : [];
    const accepted = Array.isArray(info.accepted) ? info.accepted : [];

    if (rejected.length > 0) {
      console.warn("SMTP delivery had rejected recipients", {
        shop,
        to: mail?.to,
        rejected,
        event: meta?.event || null,
      });
    }

    console.log("Custom SMTP email dispatched", {
      shop,
      to: mail?.to || null,
      subject: mail?.subject || null,
      event: meta?.event || null,
      messageId: info.messageId || null,
    });

    return {
      ok: rejected.length === 0,
      transport: "smtp",
      status: "sent",
      messageId: info.messageId || null,
      accepted,
      rejected,
    };
  } catch (error) {
    console.error("Failed to send email via custom SMTP", {
      shop,
      host,
      port,
      secure,
      to: mail?.to || null,
      subject: mail?.subject || null,
      event: meta?.event || null,
      error: error.message,
    });

    return {
      ok: false,
      transport: "smtp",
      status: "error",
      error: error.message,
    };
  }
}

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
  if (hasCustomSmtpConfig(emailSettings)) {
    return dispatchViaCustomSmtp({ shop, mail, emailSettings, meta });
  }

  if (emailSettings?.smtpProvider === "CUSTOM") {
    console.warn("Custom SMTP selected but configuration is incomplete; falling back to automation handler.", {
      shop,
      hasHost: Boolean(emailSettings?.smtpHost),
      hasPort: emailSettings?.smtpPort !== undefined && emailSettings?.smtpPort !== null,
      hasUser: Boolean(emailSettings?.smtpUser),
      hasPass: Boolean(emailSettings?.smtpPass),
    });
  }

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
