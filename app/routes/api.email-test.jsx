import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { dispatchEmailAutomation } from "../lib/automation.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const formData = await request.formData();
  const smtpHost = formData.get("smtpHost");
  const smtpPort = Number(formData.get("smtpPort") || 0);
  const smtpUser = formData.get("smtpUser");
  const smtpPass = formData.get("smtpPass");
  const smtpSecure = formData.get("smtpSecure") === "true";

  if (!smtpHost || !smtpPort || !smtpUser) {
    return json({ error: "Host, Port, and Username are required." }, { status: 400 });
  }

  const response = await dispatchEmailAutomation({
    shop,
    mail: null,
    emailSettings: {
      notificationsEnabled: true,
      smtpProvider: "CUSTOM",
      smtpHost,
      smtpPort,
      smtpUser,
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
    meta: {
      event: "smtp.verify",
      connection: {
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        user: smtpUser,
      },
    },
  });

  if (response && response.ok) {
    const data = await response.json().catch(() => ({}));
    return json({ success: "Verification dispatched", details: data });
  }

  console.error("Failed to dispatch SMTP verification via automation.");
  return json({ error: "Failed to dispatch SMTP verification." }, { status: 500 });
};
