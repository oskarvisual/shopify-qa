import { authenticate } from "../shopify.server";
import {
  gatherCustomerData,
  logGdprRequest,
  updateGdprRequestStatus,
  sendCustomerDataByEmail,
  formatCustomerDataAsJson,
} from "../lib/gdpr.server";

/**
 * GDPR Mandatory Webhook: customers/data_request
 *
 * This webhook is triggered when a customer requests their data.
 * You must return all personal data you have stored about this customer.
 *
 * Process:
 * 1. Log the GDPR request for audit purposes
 * 2. Gather all customer data from the database
 * 3. Send it to the customer via email
 * 4. Update request status
 */
export const action = async ({ request }) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Customer data request:", payload);

  // Extract customer information
  const customerId = payload.customer?.id?.toString();
  const customerEmail = payload.customer?.email;
  const shopDomain = payload.shop_domain;

  let gdprRequest = null;

  try {
    // 1. Log the GDPR request for audit trail
    gdprRequest = await logGdprRequest({
      shop: shopDomain,
      requestType: "data_request",
      customerEmail,
      customerId,
      payload,
    });

    console.log(
      `[GDPR] Logged data request ${gdprRequest.id} for customer ${customerId} (${customerEmail}) from shop ${shopDomain}`
    );

    // 2. Gather all customer data
    await updateGdprRequestStatus(gdprRequest.id, "processing");

    const customerData = await gatherCustomerData(
      shopDomain,
      customerEmail,
      customerId
    );

    console.log(`[GDPR] Gathered customer data:`, {
      questions: customerData.questions.length,
      answers: customerData.answers.length,
      votes: customerData.votes.length,
      aiInteractions: customerData.aiInteractions.length,
    });

    // 3. Send data to customer
    // Note: You should implement the actual email sending in gdpr.server.js
    const emailResult = await sendCustomerDataByEmail(
      customerEmail,
      customerData,
      shopDomain
    );

    // 4. Update request status to completed
    await updateGdprRequestStatus(gdprRequest.id, "completed");

    console.log(
      `[GDPR] Successfully processed data request ${gdprRequest.id}`
    );

    // Optional: Log the data to console for debugging (remove in production)
    if (process.env.NODE_ENV === "development") {
      console.log("[GDPR] Customer data:", formatCustomerDataAsJson(customerData));
    }
  } catch (error) {
    console.error("[GDPR] Error processing customer data request:", error);

    // Update request status to failed
    if (gdprRequest) {
      await updateGdprRequestStatus(gdprRequest.id, "failed");
    }

    // Even if there's an error, return 200 to acknowledge receipt
    // Shopify requires a 200 response within 5 seconds
    // You should handle retries and notifications separately
  }

  return new Response(null, { status: 200 });
};
