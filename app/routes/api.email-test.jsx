import { json } from "@remix-run/node";
import nodemailer from "nodemailer";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  // Authenticate the request to ensure it's coming from an admin
  await authenticate.admin(request);

  const formData = await request.formData();
  const smtpHost = formData.get("smtpHost");
  const smtpPort = Number(formData.get("smtpPort") || 0);
  const smtpUser = formData.get("smtpUser");
  const smtpPass = formData.get("smtpPass");
  const smtpSecure = formData.get("smtpSecure") === "true";

  if (!smtpHost || !smtpPort || !smtpUser) {
    return json({ error: "Host, Port, and Username are required." }, { status: 400 });
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  try {
    await transporter.verify();
    return json({ success: "Connection successful!" });
  } catch (error) {
    console.error("SMTP Connection Error:", error);
    return json({ error: `Connection failed: ${error.message}` }, { status: 500 });
  }
};
