import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { dispatchEmailAutomation } from "../lib/automation.server";
import { getSubscriptionPlanContext } from "../lib/plans.server";
import { SubscriptionPlan } from "../lib/plans";
import { validateCustomFromAddress } from "../lib/email-validation";

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const { shop, subscriptionPlan } = session;

  const planContext = await getSubscriptionPlanContext({ shop, sessionPlan: subscriptionPlan });

  if (planContext.plan !== SubscriptionPlan.ULTRA) {
    return json(
      { error: "Custom SMTP is only available on the Ultra plan." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const smtpHost = formData.get("smtpHost");
  const smtpPort = Number(formData.get("smtpPort") || 0);
  const smtpUser = formData.get("smtpUser");
  const smtpFromEmail = formData.get("smtpFromEmail");
  const smtpPass = formData.get("smtpPass");
  const smtpSecure = formData.get("smtpSecure") === "true";

  if (!smtpHost || !smtpPort || !smtpUser) {
    return json({ error: "Host, Port, and Username are required." }, { status: 400 });
  }

  const customValidation = validateCustomFromAddress({
    smtpUser,
    smtpFromEmail,
  });

  if (!customValidation.ok) {
    return json({ error: customValidation.error }, { status: 400 });
  }

  const response = await dispatchEmailAutomation({
    shop,
    mail: null,
    emailSettings: {
      notificationsEnabled: true,
      smtpProvider: "CUSTOM",
      smtpHost,
      smtpPort,
      smtpUser: customValidation.smtpUser,
      smtpFromEmail: customValidation.smtpFromEmail,
      smtpPass,
      smtpSecure,
    },
    defaultSmtp: {
      host: null,
      port: null,
      secure: null,
      user: null,
      pass: null,
      fromEmail: null,
    },
    plan: planContext.plan,
    planFeatures: planContext.features,
    meta: {
      event: "smtp.verify",
      connection: {
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        user: customValidation.smtpUser,
        from: customValidation.smtpFromEmail || customValidation.smtpUser,
      },
      plan: planContext.plan,
      features: planContext.features,
    },
  });

  if (response && response.ok) {
    if (typeof response.json === "function") {
      const data = await response.json().catch(() => ({}));
      return json({ success: "Verification dispatched", details: data });
    }

    return json({
      success: response.status === "verified" ? "SMTP connection verified" : "SMTP request completed",
      details: response,
    });
  }

  const errorDetails =
    response && typeof response.json === "function"
      ? { status: response.status, statusText: response.statusText }
      : { error: response?.error || null, status: response?.status || null };

  console.error("Failed to verify SMTP configuration", {
    shop,
    ...errorDetails,
  });
  return json({ error: "Failed to verify SMTP configuration." }, { status: 500 });
}
