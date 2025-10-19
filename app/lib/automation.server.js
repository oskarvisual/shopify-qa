import { createTransport } from "nodemailer";
import { SubscriptionPlan, normalizePlan, planHasFeature, PlanFeature } from "./plans";
import { validateCustomFromAddress, normalizeEmail } from "./email-validation";

const AUTOMATIONS_APP_ID =
  process.env.AUTOMATIONS_APP_ID ||
  process.env.SHOPIFY_APP_HANDLE ||
  process.env.SHOPIFY_API_KEY ||
  "product-questions-and-answers";

const AUTOMATIONS_GLOBAL_TOKEN = process.env.AUTOMATIONS_TOKEN?.trim() || null;

const DEFAULT_CUSTOM_SMTP_TIMEOUT_MS = (() => {
  const rawTimeout =
    process.env.CUSTOM_SMTP_TIMEOUT_MS ||
    process.env.SMTP_TIMEOUT_MS ||
    process.env.SMTP_TIMEOUT;
  const parsed = Number(rawTimeout);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
})();

function resolvePlanInfo({ plan, planFeatures, meta }) {
  const normalizedPlan = plan ? normalizePlan(plan) : null;
  const featuresFromOptions = planFeatures && typeof planFeatures === "object" ? planFeatures : null;
  const metaFeatures = meta?.features && typeof meta.features === "object" ? meta.features : null;
  const resolvedFeatures = featuresFromOptions || metaFeatures || null;

  const planFromFeatures = resolvedFeatures?.plan ? normalizePlan(resolvedFeatures.plan) : null;
  const planFromMeta = meta?.plan ? normalizePlan(meta.plan) : null;

  const effectivePlan = normalizedPlan || planFromFeatures || planFromMeta || null;
  const allowsCustomSmtp =
    (effectivePlan && effectivePlan === SubscriptionPlan.ULTRA) ||
    (resolvedFeatures ? planHasFeature(resolvedFeatures, PlanFeature.SETTINGS_EMAIL_SMTP) : false);

  return {
    effectivePlan,
    features: resolvedFeatures,
    allowsCustomSmtp,
  };
}

function hasCustomSmtpConfig(emailSettings) {
  if (!emailSettings || emailSettings.smtpProvider !== "CUSTOM") {
    return false;
  }

  const host = typeof emailSettings.smtpHost === "string" ? emailSettings.smtpHost.trim() : "";
  if (!host) {
    return false;
  }

  const port = Number(emailSettings.smtpPort);
  if (!Number.isFinite(port) || port <= 0) {
    return false;
  }

  const user = normalizeEmail(emailSettings.smtpUser);
  if (!user) {
    return false;
  }

  const pass = typeof emailSettings.smtpPass === "string" ? emailSettings.smtpPass.trim() : "";
  if (!pass) {
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
  const host = typeof emailSettings.smtpHost === "string" ? emailSettings.smtpHost.trim() : null;
  const port = Number(emailSettings.smtpPort);
  const user = normalizeEmail(emailSettings.smtpUser);
  const pass = typeof emailSettings.smtpPass === "string" ? emailSettings.smtpPass : null;
  const secure = resolveSmtpSecureFlag(emailSettings);
  const fromAddress = normalizeEmail(emailSettings.smtpFromEmail) || user;

  const transporter = createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    connectionTimeout: DEFAULT_CUSTOM_SMTP_TIMEOUT_MS,
    socketTimeout: DEFAULT_CUSTOM_SMTP_TIMEOUT_MS,
    greetingTimeout: DEFAULT_CUSTOM_SMTP_TIMEOUT_MS,
  });

  try {
    if (!mail || Object.keys(mail).length === 0) {
      await transporter.verify();
      console.log("Custom SMTP connection verified", {
        shop,
        host,
        port,
        secure,
        timeoutMs: DEFAULT_CUSTOM_SMTP_TIMEOUT_MS,
        event: meta?.event || null,
      });

      return {
        ok: true,
        transport: "smtp",
        status: "verified",
        host,
        port,
        secure,
        timeoutMs: DEFAULT_CUSTOM_SMTP_TIMEOUT_MS,
      };
    }

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
      from: fromAddress,
      timeoutMs: DEFAULT_CUSTOM_SMTP_TIMEOUT_MS,
    });

    return {
      ok: rejected.length === 0,
      transport: "smtp",
      status: "sent",
      messageId: info.messageId || null,
      accepted,
      rejected,
      timeoutMs: DEFAULT_CUSTOM_SMTP_TIMEOUT_MS,
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
      from: fromAddress,
      timeoutMs: DEFAULT_CUSTOM_SMTP_TIMEOUT_MS,
    });

    return {
      ok: false,
      transport: "smtp",
      status: "error",
      error: error.message,
      timeoutMs: DEFAULT_CUSTOM_SMTP_TIMEOUT_MS,
    };
  } finally {
    if (typeof transporter.close === "function") {
      try {
        transporter.close();
      } catch (closeError) {
        console.warn("Failed to close SMTP transporter", {
          shop,
          host,
          port,
          error: closeError.message,
        });
      }
    }
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
  plan,
  planFeatures,
}) {
  const { effectivePlan, features, allowsCustomSmtp } = resolvePlanInfo({
    plan,
    planFeatures,
    meta,
  });

  const customConfigComplete = hasCustomSmtpConfig(emailSettings);
  const shouldValidateCustom = emailSettings?.smtpProvider === "CUSTOM";
  const emailValidation = shouldValidateCustom
    ? validateCustomFromAddress({
        smtpUser: emailSettings?.smtpUser,
        smtpFromEmail: emailSettings?.smtpFromEmail,
      })
    : {
        ok: true,
        smtpUser: normalizeEmail(emailSettings?.smtpUser),
        smtpFromEmail: normalizeEmail(emailSettings?.smtpFromEmail) || null,
      };

  if (shouldValidateCustom && !emailValidation.ok) {
    console.warn("Custom SMTP validation failed; falling back to automation handler.", {
      shop,
      reason: emailValidation.error,
    });
  }

  const sanitizedEmailSettings = emailValidation.ok
    ? {
        ...emailSettings,
        ...(emailValidation.smtpUser !== undefined
          ? { smtpUser: emailValidation.smtpUser }
          : {}),
        ...(emailValidation.smtpFromEmail !== undefined
          ? { smtpFromEmail: emailValidation.smtpFromEmail }
          : {}),
      }
    : emailSettings;

  const resolvedMeta = { ...meta };
  if (effectivePlan && !resolvedMeta.plan) {
    resolvedMeta.plan = effectivePlan;
  }
  if (features && !resolvedMeta.features) {
    resolvedMeta.features = features;
  }

  const canUseValidatedCustom =
    allowsCustomSmtp && customConfigComplete && (!shouldValidateCustom || emailValidation.ok);

  if (canUseValidatedCustom) {
    return dispatchViaCustomSmtp({ shop, mail, emailSettings: sanitizedEmailSettings, meta: resolvedMeta });
  }

  if (emailSettings?.smtpProvider === "CUSTOM") {
    if (!allowsCustomSmtp) {
      console.warn(
        "Custom SMTP selected but plan is not eligible; falling back to automation handler.",
        {
          shop,
          plan: effectivePlan || null,
        },
      );
    } else if (!customConfigComplete) {
      console.warn(
        "Custom SMTP selected but configuration is incomplete; falling back to automation handler.",
        {
          shop,
          hasHost: Boolean(emailSettings?.smtpHost),
          hasPort:
            emailSettings?.smtpPort !== undefined && emailSettings?.smtpPort !== null,
          hasUser: Boolean(emailSettings?.smtpUser),
          hasPass: Boolean(emailSettings?.smtpPass),
          hasFrom: Boolean(emailSettings?.smtpFromEmail),
        },
      );
    }
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
    emailSettings: sanitizedEmailSettings,
    defaultSmtp,
    meta: resolvedMeta,
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
