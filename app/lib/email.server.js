import prisma from "../db.server";
import { dispatchEmailAutomation } from "./automation.server";
import { getSubscriptionPlanContext } from "./plans.server";
import { PlanFeature, planHasFeature } from "./plans";

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

function replaceEmailVariables(template, variables) {
  if (!template) return "";
  let result = template;
  Object.keys(variables).forEach((key) => {
    const value = variables[key] || "";
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  });
  return result;
}

function getDefaultSmtpConfig() {
  return {
    host: process.env.SMTP_HOST || null,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
    secure: (process.env.SMTP_SECURE || "true") === "true",
    user: process.env.SMTP_USER || null,
    pass: process.env.SMTP_PASS || null,
    fromEmail: process.env.SMTP_FROM_EMAIL || "noreply@example.com",
  };
}

function sanitizeEmailSettingsForPlan(settings, planFeatures) {
  if (!settings) {
    return settings;
  }

  if (planHasFeature(planFeatures, PlanFeature.SETTINGS_EMAIL_SMTP)) {
    return settings;
  }

  return {
    ...settings,
    smtpProvider: "APP",
    smtpHost: null,
    smtpPort: null,
    smtpUser: null,
    smtpFromEmail: null,
    smtpPass: null,
    smtpSecure: true,
    answerEmailSubject: null,
    answerEmailBody: null,
    questionPublishedSubject: null,
    questionPublishedEmailBody: null,
    newQuestionAdminSubject: null,
    newQuestionAdminEmailBody: null,
  };
}

async function loadEmailSettingsWithPlan(shop) {
  const [settings, planContext] = await Promise.all([
    prisma.emailSetting.findUnique({ where: { shop } }),
    getSubscriptionPlanContext({ shop }),
  ]);

  return {
    planContext,
    settings: sanitizeEmailSettingsForPlan(settings, planContext.features),
  };
}

/**
 * @typedef {object} MailOptions
 * @property {string} to
 * @property {string} subject
 * @property {string} html
 */

/**
 * Enqueue an email to n8n for delivery.
 * @param {string} shop
 * @param {MailOptions} mailOptions
 * @param {{settings?: import("@prisma/client").EmailSetting|null, metadata?: object, planContext?: Awaited<ReturnType<typeof getSubscriptionPlanContext>>}} options
 */
export async function sendEmail(shop, mailOptions, options = {}) {
  if (!mailOptions?.to) {
    console.warn("sendEmail called without recipient; skipping.");
    return;
  }

  const {
    settings: providedSettings = null,
    metadata = {},
    planContext: providedPlanContext = null,
  } = options;

  const planContext = providedPlanContext ?? (await getSubscriptionPlanContext({ shop }));
  const planFeatures = planContext.features;

  const rawSettings =
    providedSettings ?? (await prisma.emailSetting.findUnique({ where: { shop } }));

  const settings = sanitizeEmailSettingsForPlan(rawSettings, planFeatures);

  if (!settings?.notificationsEnabled) {
    console.log(`Email notifications disabled for ${shop}; email not dispatched.`);
    return;
  }

  const defaultSmtp = getDefaultSmtpConfig();

  await dispatchEmailAutomation({
    shop,
    mail: mailOptions,
    emailSettings: settings,
    defaultSmtp,
    plan: planContext.plan,
    planFeatures,
    meta: {
      ...metadata,
      fromEmail: defaultSmtp.fromEmail,
      plan: planContext.plan,
      features: planFeatures,
    },
  });
}

export async function sendNewQuestionNotification(shop, question, options = {}) {
  const { settings, planContext } = await loadEmailSettingsWithPlan(shop);

  if (
    !settings?.notificationsEnabled ||
    !settings?.notifyOnNewQuestion ||
    !settings?.notificationEmails
  ) {
    return;
  }

  const questionPath = options.questionPath || `/app/questions/${question.id}`;
  const dashboardUrl = getAdminAppUrl(shop, questionPath);
  const friendlyStoreName = options.storeName || formatShopName(shop);

  const variables = {
    customerName: question.customerName || "Anonymous",
    question: question.question,
    dashboardUrl: dashboardUrl || "",
    storeName: friendlyStoreName,
  };

  const defaultSubject = "New Question Submitted on Your Store";
  const defaultBody =
    "<p>A new question has been submitted:</p>" +
    "<blockquote>{{question}}</blockquote>" +
    "<p>Customer: {{customerName}}</p>" +
    (dashboardUrl
      ? "<p>You can view and answer the question in your app dashboard <a href=\"{{dashboardUrl}}\">here</a>.</p>"
      : "<p>You can view and answer the question in your app dashboard.</p>") +
    (friendlyStoreName ? "<p>Best regards,<br />{{storeName}}</p>" : "");

  const resolvedSubject = settings?.newQuestionAdminSubject
    ? replaceEmailVariables(settings.newQuestionAdminSubject, variables)
    : defaultSubject;

  const resolvedBody = settings?.newQuestionAdminEmailBody
    ? replaceEmailVariables(settings.newQuestionAdminEmailBody, variables)
    : replaceEmailVariables(defaultBody, variables);

  const emails = settings.notificationEmails
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (emails.length === 0) {
    return;
  }

  for (const email of emails) {
    await sendEmail(
      shop,
      { to: email, subject: resolvedSubject, html: resolvedBody },
      {
        settings,
        planContext,
        metadata: {
          event: "admin.newQuestion",
          questionId: question.id,
          productId: question.productId,
        },
      },
    );
  }
}

export async function sendNewAnswerNotification(shop, question, answer, options = {}) {
  const { settings, planContext } = await loadEmailSettingsWithPlan(shop);

  if (!settings?.notificationsEnabled) {
    return;
  }

  const { productHandle, storeName, productName } = options;
  const productUrl = buildProductUrl(shop, productHandle);
  const friendlyStoreName = storeName || formatShopName(shop);

  const variables = {
    customerName: question.customerName || "there",
    question: question.question,
    answer: answer.answer,
    productUrl: productUrl || "",
    productName: productName || "the product",
    storeName: friendlyStoreName,
  };

  const defaultSubject = "Your question has been answered!";
  const defaultBody =
    "<p>Hi {{customerName}},</p>" +
    "<p>You asked:</p>" +
    "<blockquote>{{question}}</blockquote>" +
    "<p>A new answer has been provided:</p>" +
    "<blockquote>{{answer}}</blockquote>" +
    (productUrl
      ? "<p>You can view the question and answer on the product page <a href=\"{{productUrl}}\">here</a>.</p>"
      : "<p>You can view the question and answer on the product page.</p>") +
    (friendlyStoreName ? "<p>Best regards,<br />{{storeName}}</p>" : "");

  const subject = settings?.answerEmailSubject
    ? replaceEmailVariables(settings.answerEmailSubject, variables)
    : defaultSubject;

  const html = settings?.answerEmailBody
    ? replaceEmailVariables(settings.answerEmailBody, variables)
    : replaceEmailVariables(defaultBody, variables);

  if (!question.customerEmail) {
    return;
  }

  await sendEmail(
    shop,
    { to: question.customerEmail, subject, html },
    {
      settings,
      planContext,
      metadata: {
        event: "customer.answerNotification",
        questionId: question.id,
        answerId: answer.id,
        productId: question.productId,
      },
    },
  );
}

export async function sendQuestionPublishedNotification(shop, question, options = {}) {
  const { settings, planContext } = await loadEmailSettingsWithPlan(shop);

  if (!settings?.notificationsEnabled) {
    return;
  }

  const { productHandle, storeName, productName } = options;
  const productUrl = buildProductUrl(shop, productHandle);
  const friendlyStoreName = storeName || formatShopName(shop);

  const variables = {
    customerName: question.customerName || "there",
    question: question.question,
    productUrl: productUrl || "",
    productName: productName || "the product",
    storeName: friendlyStoreName,
  };

  const defaultSubject = "Your question has been published!";
  const defaultBody =
    "<p>Hi {{customerName}},</p>" +
    "<p>You asked:</p>" +
    "<blockquote>{{question}}</blockquote>" +
    (productUrl
      ? "<p>Your question has been published on our store. You can view it on the product page <a href=\"{{productUrl}}\">here</a>.</p>"
      : "<p>Your question has been published on our store. You can view it on the product page.</p>") +
    (friendlyStoreName ? "<p>Best regards,<br />{{storeName}}</p>" : "");

  const subject = settings?.questionPublishedSubject
    ? replaceEmailVariables(settings.questionPublishedSubject, variables)
    : defaultSubject;

  const html = settings?.questionPublishedEmailBody
    ? replaceEmailVariables(settings.questionPublishedEmailBody, variables)
    : replaceEmailVariables(defaultBody, variables);

  if (!question.customerEmail) {
    return;
  }

  await sendEmail(
    shop,
    { to: question.customerEmail, subject, html },
    {
      settings,
      planContext,
      metadata: {
        event: "customer.questionPublished",
        questionId: question.id,
        productId: question.productId,
      },
    },
  );
}
