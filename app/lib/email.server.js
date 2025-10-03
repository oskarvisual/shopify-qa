import nodemailer from "nodemailer";
import prisma from "../db.server";

function formatShopName(shop) {
  if (!shop) {
    return "";
  }
  const withoutDomain = shop.replace(/\.myshopify\.com$/i, "");
  return withoutDomain
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const SHOPIFY_APP_HANDLE = process.env.SHOPIFY_APP_HANDLE || "product-questions-and-answers-2";

function buildProductUrl(shop, handle) {
  if (!shop || !handle) {
    return null;
  }
  return `https://${shop}/products/${handle}`;
}

function getAdminAppUrl(shop, path = "") {
  if (!shop) {
    return null;
  }
  const normalizedPath = path ? `/${path.replace(/^\/+/g, "")}` : "";
  return `https://${shop}/admin/apps/${SHOPIFY_APP_HANDLE}${normalizedPath}`;
}

/**
 * @typedef {object} MailOptions
 * @property {string} to
 * @property {string} subject
 * @property {string} html
 */

/**
 * Sends an email using the configured SMTP settings for a given shop.
 * @param {string} shop - The shop's domain.
 * @param {MailOptions} mailOptions - The email options.
 */
export async function sendEmail(shop, mailOptions) {
  const emailLog = await prisma.emailLog.create({
    data: {
      shop,
      to: mailOptions.to,
      subject: mailOptions.subject,
      body: mailOptions.html,
      status: "PENDING",
    },
  });

  const settings = await prisma.emailSetting.findUnique({ where: { shop } });

  // 1. Check if notifications are enabled at all
  if (!settings?.notificationsEnabled) {
    console.log(`Email notifications are disabled for ${shop}. Aborting send.`);
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        status: "DISABLED",
        response: "Email notifications are disabled for this shop.",
      },
    });
    return;
  }

  let transporter;
  let logData;

  try {
    // 2. Configure the transporter (email sending client)
    if (settings.smtpProvider === "CUSTOM" && settings.smtpHost) {
      // Use custom SMTP settings from the database
      logData = {
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpUser: settings.smtpUser,
      };
      transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort,
        secure: settings.smtpSecure,
        auth: {
          user: settings.smtpUser,
          pass: settings.smtpPass, // TODO: Decrypt this value
        },
      });
    } else {
      // Use default SMTP settings from .env variables
      if (!process.env.SMTP_HOST) {
        console.error("Default SMTP settings are not configured in .env. Cannot send email.");
        await prisma.emailLog.update({
          where: { id: emailLog.id },
          data: {
            status: "FAILED",
            response: "Default SMTP settings are not configured in .env.",
          },
        });
        return;
      }
      logData = {
        smtpHost: process.env.SMTP_HOST,
        smtpPort: Number(process.env.SMTP_PORT || 587),
        smtpUser: process.env.SMTP_USER,
      };
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: (process.env.SMTP_SECURE || "true") === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }

    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: { ...logData },
    });

    // 3. Send the email
    const fromEmail = process.env.SMTP_FROM_EMAIL || "noreply@example.com";
    const info = await transporter.sendMail({
      from: `"Your App Name" <${fromEmail}>`,
      ...mailOptions,
    });

    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        status: "SENT",
        response: JSON.stringify(info, null, 2),
      },
    });

    console.log(`Email sent successfully to ${mailOptions.to}`);

  } catch (error) {
    console.error(`Failed to send email for shop ${shop}:`, error);
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        status: "FAILED",
        response: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
      },
    });
    // We don't throw the error to avoid crashing the parent process
  }
}

/**
 * Sends a notification to administrators about a new question.
 * @param {string} shop
 * @param {import("@prisma/client").Question} question
 */
export async function sendNewQuestionNotification(shop, question, options = {}) {
  const settings = await prisma.emailSetting.findUnique({ where: { shop } });

  const subject = `New Question Submitted on Your Store`;
  const questionPath = options.questionPath || `/app/questions/${question.id}`;
  const dashboardUrl = getAdminAppUrl(shop, questionPath);
  const friendlyStoreName = options.storeName || formatShopName(shop);
  const html = `
    <p>A new question has been submitted:</p>
    <blockquote>${question.question}</blockquote>
    <p>Customer: ${question.customerName || "Anonymous"}</p>
    <p>${dashboardUrl ? `You can view and answer the question in your app dashboard <a href="${dashboardUrl}">here</a>.` : "You can view and answer the question in your app dashboard."}</p>
    ${friendlyStoreName ? `<p>Best regards,<br />${friendlyStoreName}</p>` : ""}
  `;

  // Check if this specific notification is enabled and emails are configured
  if (!settings?.notifyOnNewQuestion || !settings?.notificationEmails) {
    await prisma.emailLog.create({
      data: {
        shop,
        to: settings?.notificationEmails || "",
        subject,
        body: html,
        status: "DISABLED",
        response: "Notification for new questions is disabled or no email is configured.",
      },
    });
    return;
  }

  const emails = settings.notificationEmails.split(",").map(e => e.trim()).filter(e => e);
  if (emails.length === 0) {
    await prisma.emailLog.create({
      data: {
        shop,
        to: settings.notificationEmails,
        subject,
        body: html,
        status: "DISABLED",
        response: "No valid email addresses found in notification settings.",
      },
    });
    return;
  }

  // Send an individual email to each administrator
  for (const email of emails) {
    await sendEmail(shop, { to: email, subject, html });
  }
}

/**
 * Sends a notification to the customer when their question is answered.
 * @param {string} shop
 * @param {import("@prisma/client").Question} question
 * @param {import("@prisma/client").Answer} answer
 */
export async function sendNewAnswerNotification(shop, question, answer, options = {}) {
  const { productHandle, storeName } = options;
  const productUrl = buildProductUrl(shop, productHandle);
  const friendlyStoreName = storeName || formatShopName(shop);
  const subject = `Your question has been answered!`;
  const html = `
    <p>Hi ${question.customerName || "there"},</p>
    <p>You asked:</p>
    <blockquote>${question.question}</blockquote>
    <p>A new answer has been provided:</p>
    <blockquote>${answer.answer}</blockquote>
    <p>${productUrl ? `You can view the question and answer on the product page <a href="${productUrl}">here</a>.` : "You can view the question and answer on the product page."}</p>
    ${friendlyStoreName ? `<p>Best regards,<br />${friendlyStoreName}</p>` : ""}
  `;

  // Check if the customer provided an email
  if (!question.customerEmail) {
    await prisma.emailLog.create({
      data: {
        shop,
        to: "",
        subject,
        body: html,
        status: "DISABLED",
        response: "Customer did not provide an email address.",
      },
    });
    return;
  }

  await sendEmail(shop, { to: question.customerEmail, subject, html });
}

/**
 * Sends a notification to the customer when their question is published.
 * @param {string} shop
 * @param {import("@prisma/client").Question} question
 */
export async function sendQuestionPublishedNotification(shop, question, options = {}) {
  const { productHandle, storeName } = options;
  const productUrl = buildProductUrl(shop, productHandle);
  const friendlyStoreName = storeName || formatShopName(shop);
  const subject = `Your question has been published!`;
  const html = `
    <p>Hi ${question.customerName || "there"},</p>
    <p>You asked:</p>
    <blockquote>${question.question}</blockquote>
    <p>${productUrl ? `Your question has been published on our store. You can view it on the product page <a href="${productUrl}">here</a>.` : "Your question has been published on our store. You can view it on the product page."}</p>
    ${friendlyStoreName ? `<p>Best regards,<br />${friendlyStoreName}</p>` : ""}
  `;

  // Check if the customer provided an email
  if (!question.customerEmail) {
    await prisma.emailLog.create({
      data: {
        shop,
        to: "",
        subject,
        body: html,
        status: "DISABLED",
        response: "Customer did not provide an email address.",
      },
    });
    return;
  }

  await sendEmail(shop, { to: question.customerEmail, subject, html });
}
