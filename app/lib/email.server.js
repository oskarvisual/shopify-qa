import nodemailer from "nodemailer";
import prisma from "../db.server";

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
  const settings = await prisma.emailSetting.findUnique({ where: { shop } });

  // 1. Check if notifications are enabled at all
  if (!settings?.notificationsEnabled) {
    console.log(`Email notifications are disabled for ${shop}. Aborting send.`);
    return;
  }

  let transporter;

  try {
    // 2. Configure the transporter (email sending client)
    if (settings.smtpProvider === "CUSTOM" && settings.smtpHost) {
      // Use custom SMTP settings from the database
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
        return;
      }
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

    // 3. Send the email
    const fromEmail = process.env.SMTP_FROM_EMAIL || "noreply@example.com";
    await transporter.sendMail({
      from: `"Your App Name" <${fromEmail}>`,
      ...mailOptions,
    });

    console.log(`Email sent successfully to ${mailOptions.to}`);

  } catch (error) {
    console.error(`Failed to send email for shop ${shop}:`, error);
    // We don't throw the error to avoid crashing the parent process
  }
}

/**
 * Sends a notification to administrators about a new question.
 * @param {string} shop
 * @param {import("@prisma/client").Question} question
 */
export async function sendNewQuestionNotification(shop, question) {
  const settings = await prisma.emailSetting.findUnique({ where: { shop } });

  // Check if this specific notification is enabled and emails are configured
  if (!settings?.notifyOnNewQuestion || !settings?.notificationEmails) {
    return;
  }

  const emails = settings.notificationEmails.split(",").map(e => e.trim()).filter(e => e);
  if (emails.length === 0) {
    return;
  }

  const subject = `New Question Submitted on Your Store`;
  const html = `
    <p>A new question has been submitted:</p>
    <blockquote>${question.question}</blockquote>
    <p>Customer: ${question.customerName || "Anonymous"}</p>
    <p>You can view and answer the question in your app dashboard.</p>
  `;

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
export async function sendNewAnswerNotification(shop, question, answer) {
  // Check if the customer provided an email
  if (!question.customerEmail) {
    return;
  }

  const subject = `Your question has been answered!`;
  const html = `
    <p>Hi ${question.customerName || "there"},</p>
    <p>You asked:</p>
    <blockquote>${question.question}</blockquote>
    <p>A new answer has been provided:</p>
    <blockquote>${answer.answer}</blockquote>
    <p>You can view the question and answer on the product page.</p>
  `;

  await sendEmail(shop, { to: question.customerEmail, subject, html });
}
