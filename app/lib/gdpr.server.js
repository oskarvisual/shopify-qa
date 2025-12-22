import prisma from "../db.server";

/**
 * Gathers all personal data for a customer from the database
 * @param {string} shop - The shop domain
 * @param {string} customerEmail - The customer's email address
 * @param {string} customerId - The customer's Shopify ID
 * @returns {Promise<Object>} All customer data in a structured format
 */
export async function gatherCustomerData(shop, customerEmail, customerId) {
  const data = {
    customer: {
      email: customerEmail,
      shopifyId: customerId,
      shop: shop,
    },
    questions: [],
    answers: [],
    votes: [],
    aiInteractions: [],
    dataGatheredAt: new Date().toISOString(),
  };

  try {
    // Find all questions submitted by this customer
    if (customerEmail) {
      const questions = await prisma.question.findMany({
        where: {
          shop: shop,
          customerEmail: customerEmail,
        },
        include: {
          answers: true,
          voteLogs: true,
        },
      });

      data.questions = questions.map((q) => ({
        id: q.id,
        productId: q.productId,
        customerName: q.customerName,
        customerEmail: q.customerEmail,
        question: q.question,
        isPublished: q.isPublished,
        votes: q.votes,
        createdAt: q.createdAt.toISOString(),
        updatedAt: q.updatedAt.toISOString(),
        answers: q.answers.map((a) => ({
          id: a.id,
          authorName: a.authorName,
          authorEmail: a.authorEmail,
          answer: a.answer,
          isPublished: a.isPublished,
          createdAt: a.createdAt.toISOString(),
        })),
      }));
    }

    // Find all answers authored by this customer
    if (customerEmail) {
      const answers = await prisma.answer.findMany({
        where: {
          shop: shop,
          authorEmail: customerEmail,
        },
        include: {
          question: true,
        },
      });

      data.answers = answers.map((a) => ({
        id: a.id,
        questionId: a.questionId,
        authorName: a.authorName,
        authorEmail: a.authorEmail,
        answer: a.answer,
        isPublished: a.isPublished,
        createdAt: a.createdAt.toISOString(),
        relatedQuestion: {
          id: a.question.id,
          question: a.question.question,
          productId: a.question.productId,
        },
      }));
    }

    // Find all votes by this customer (using email as identifier)
    if (customerEmail) {
      const votes = await prisma.voteLog.findMany({
        where: {
          shop: shop,
          identifier: customerEmail,
        },
        include: {
          question: true,
        },
      });

      data.votes = votes.map((v) => ({
        id: v.id,
        questionId: v.questionId,
        identifier: v.identifier,
        createdAt: v.createdAt.toISOString(),
        relatedQuestion: {
          id: v.question.id,
          question: v.question.question,
          productId: v.question.productId,
        },
      }));
    }

    // Find AI interactions (search for email in customerQuestion text)
    // This is a best-effort search since we don't directly link AI logs to customers
    if (customerEmail) {
      const aiLogs = await prisma.aILog.findMany({
        where: {
          shop: shop,
          OR: [
            {
              customerQuestion: {
                contains: customerEmail,
              },
            },
          ],
        },
      });

      data.aiInteractions = aiLogs.map((log) => ({
        id: log.id,
        productId: log.productId,
        customerQuestion: log.customerQuestion,
        aiAnswer: log.aiAnswer,
        vote: log.vote,
        askedHuman: log.askedHuman,
        noAnswer: log.noAnswer,
        createdAt: log.createdAt.toISOString(),
      }));
    }

    return data;
  } catch (error) {
    console.error("Error gathering customer data:", error);
    throw error;
  }
}

/**
 * Creates a GDPR request log entry
 * @param {Object} params
 * @param {string} params.shop - The shop domain
 * @param {string} params.requestType - Type of GDPR request (data_request, redact, etc.)
 * @param {string} params.customerEmail - Customer's email
 * @param {string} params.customerId - Customer's Shopify ID
 * @param {Object} params.payload - Original webhook payload
 * @returns {Promise<Object>} The created GDPR request record
 */
export async function logGdprRequest({
  shop,
  requestType,
  customerEmail,
  customerId,
  payload,
}) {
  try {
    return await prisma.gdprRequest.create({
      data: {
        shop,
        requestType,
        customerEmail,
        customerId,
        payload: JSON.stringify(payload),
        status: "pending",
      },
    });
  } catch (error) {
    console.error("Error logging GDPR request:", error);
    throw error;
  }
}

/**
 * Updates a GDPR request status
 * @param {string} id - GDPR request ID
 * @param {string} status - New status (pending, processing, completed, failed)
 * @returns {Promise<Object>} The updated GDPR request record
 */
export async function updateGdprRequestStatus(id, status) {
  try {
    return await prisma.gdprRequest.update({
      where: { id },
      data: {
        status,
        processedAt: status === "completed" ? new Date() : undefined,
      },
    });
  } catch (error) {
    console.error("Error updating GDPR request status:", error);
    throw error;
  }
}

/**
 * Formats customer data as a readable JSON string
 * @param {Object} customerData - The customer data object
 * @returns {string} Formatted JSON string
 */
export function formatCustomerDataAsJson(customerData) {
  return JSON.stringify(customerData, null, 2);
}

/**
 * Sends customer data via email
 * @param {string} customerEmail - Email to send data to
 * @param {Object} customerData - The customer data
 * @param {string} shop - Shop domain
 */
export async function sendCustomerDataByEmail(
  customerEmail,
  customerData,
  shop
) {
  console.log(`[GDPR] Sending customer data to ${customerEmail} for shop ${shop}`);
  console.log(`[GDPR] Data summary:
    - Questions: ${customerData.questions.length}
    - Answers: ${customerData.answers.length}
    - Votes: ${customerData.votes.length}
    - AI Interactions: ${customerData.aiInteractions.length}
  `);

  try {
    // Import email functionality
    const { dispatchEmailAutomation } = await import("./automation.server");
    const { getSubscriptionPlanContext } = await import("./plans.server");

    const planContext = await getSubscriptionPlanContext({ shop });

    // Format customer data as HTML for email body
    const dataJson = formatCustomerDataAsJson(customerData);
    const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Your Personal Data Request</h2>
          <p>Hello,</p>
          <p>As requested, here is all the personal data we have stored about you in our Product Questions & Answers app.</p>

          <h3 style="color: #555; margin-top: 30px;">Data Summary:</h3>
          <ul style="line-height: 1.8;">
            <li><strong>Questions submitted:</strong> ${customerData.questions.length}</li>
            <li><strong>Answers provided:</strong> ${customerData.answers.length}</li>
            <li><strong>Votes cast:</strong> ${customerData.votes.length}</li>
            <li><strong>AI interactions:</strong> ${customerData.aiInteractions.length}</li>
          </ul>

          <h3 style="color: #555; margin-top: 30px;">Complete Data:</h3>
          <details>
            <summary style="cursor: pointer; color: #0066cc;">Click to view your complete data (JSON format)</summary>
            <pre style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; font-size: 12px;">${dataJson}</pre>
          </details>

          <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
            This email was sent in response to your GDPR data request. If you did not request this information, please contact the store owner.
          </p>
        </body>
      </html>
    `;

    // Send email using the existing automation system
    await dispatchEmailAutomation({
      shop,
      mail: {
        to: customerEmail,
        subject: "Your Personal Data Request - Product Questions & Answers",
        html: htmlBody,
      },
      emailSettings: null,
      defaultSmtp: {
        host: process.env.SMTP_HOST || null,
        port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
        secure: (process.env.SMTP_SECURE || "true") === "true",
        user: process.env.SMTP_USER || null,
        pass: process.env.SMTP_PASS || null,
        fromEmail: process.env.SMTP_FROM_EMAIL || "privacy@orivisdev.shop",
      },
      plan: planContext.plan,
      planFeatures: planContext.features,
      meta: {
        type: "gdpr_data_request",
        customerEmail,
        fromEmail: process.env.SMTP_FROM_EMAIL || "privacy@orivisdev.shop",
      },
    });

    console.log(`[GDPR] Successfully sent customer data to ${customerEmail}`);

    return {
      success: true,
      message: "Customer data sent via email",
    };
  } catch (error) {
    console.error(`[GDPR] Error sending customer data email:`, error);
    throw error;
  }
}
