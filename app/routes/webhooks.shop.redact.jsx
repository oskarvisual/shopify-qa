import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GDPR Mandatory Webhook: shop/redact
 *
 * This webhook is triggered 48 hours after a store owner uninstalls your app.
 *
 * You must delete or anonymize all data related to this shop.
 * This includes customer data, store data, and any other information you've collected.
 */
export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Shop redact request:", payload);

  const shopDomain = payload.shop_domain;

  try {
    console.log(`Redacting all data for shop: ${shopDomain}`);

    // Delete all questions and answers for this shop
    await prisma.question.deleteMany({
      where: {
        shop: shopDomain,
      },
    });

    // Delete automation logs
    await prisma.automationLog.deleteMany({
      where: {
        shop: shopDomain,
      },
    });

    // Delete AI logs
    await prisma.aILog.deleteMany({
      where: {
        shop: shopDomain,
      },
    });

    // Delete webhook settings
    await prisma.webhookSetting.deleteMany({
      where: {
        shop: shopDomain,
      },
    });

    // Delete settings
    await prisma.settings.deleteMany({
      where: {
        shop: shopDomain,
      },
    });

    // Delete sessions (if not already deleted by app/uninstalled webhook)
    await prisma.session.deleteMany({
      where: {
        shop: shopDomain,
      },
    });

    console.log(`Successfully redacted all data for shop: ${shopDomain}`);

  } catch (error) {
    console.error("Error processing shop redaction:", error);
    // Even if there's an error, return 200 to acknowledge receipt
    // You should handle the actual redaction asynchronously with retries
  }

  return new Response(null, { status: 200 });
};
