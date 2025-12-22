import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GDPR Mandatory Webhook: customers/redact
 *
 * This webhook is triggered when a customer requests deletion of their data
 * or when a customer is deleted from the Shopify store.
 *
 * You must delete or anonymize all personal data you have stored about this customer.
 * You have 30 days to comply, but should start the process immediately.
 */
export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Customer redact request:", payload);

  // Extract customer information
  const customerId = payload.customer?.id;
  const customerEmail = payload.customer?.email;
  const shopDomain = payload.shop_domain;

  try {
    // Delete or anonymize customer data
    console.log(`Redacting data for customer ${customerId} (${customerEmail}) from shop ${shopDomain}`);

    // Example: Anonymize questions submitted by this customer
    // Assuming you store customer email in your questions
    await prisma.question.updateMany({
      where: {
        shop: shopDomain,
        authorEmail: customerEmail,
      },
      data: {
        authorEmail: "redacted@privacy.invalid",
        authorName: "Redacted User",
      },
    });

    // Example: Anonymize answers if you track customer info
    await prisma.answer.updateMany({
      where: {
        question: {
          shop: shopDomain,
        },
        authorEmail: customerEmail,
      },
      data: {
        authorEmail: "redacted@privacy.invalid",
        authorName: "Redacted User",
      },
    });

    console.log(`Successfully redacted data for customer ${customerId}`);

  } catch (error) {
    console.error("Error processing customer redaction:", error);
    // Even if there's an error, return 200 to acknowledge receipt
    // You should handle the actual redaction asynchronously with retries
  }

  return new Response(null, { status: 200 });
};
