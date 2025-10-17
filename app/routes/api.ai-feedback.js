import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getSubscriptionPlanContext } from "../lib/plans.server";

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const adminUserId = session.userId ?? session.id;
  const adminUserName = session.firstName || "Admin";
  const { shop } = session;

  const { aiLogId, rating, feedbackText } = await request.json();

  if (!aiLogId || rating === undefined) {
    return json({ error: "Missing aiLogId or rating" }, { status: 400 });
  }

  try {
    const existingFeedback = await prisma.aiFeedback.findUnique({
      where: {
        aiLogId_adminUserId: {
          aiLogId,
          adminUserId: String(adminUserId),
        },
      },
    });

    let feedback;
    const isUpdate = Boolean(existingFeedback);

    if (isUpdate) {
      feedback = await prisma.aiFeedback.update({
        where: { id: existingFeedback.id },
        data: {
          rating,
          feedbackText,
        },
      });
    } else {
      feedback = await prisma.aiFeedback.create({
        data: {
          aiLogId,
          adminUserId: String(adminUserId),
          adminUserName,
          rating,
          feedbackText,
        },
      });
    }

    const webhookUrl = process.env.AUTOMATIONS_AI_FEEDBACK_WEBHOOK_URL?.trim();

    if (webhookUrl) {
      const aiLog = await prisma.aiLog.findUnique({
        where: { id: aiLogId },
        select: {
          id: true,
          shop: true,
          productId: true,
          customerQuestion: true,
          aiAnswer: true,
          fullContext: true,
          vote: true,
          askedHuman: true,
          noAnswer: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const planContext = await getSubscriptionPlanContext({ shop });

      const appId =
        process.env.AUTOMATIONS_APP_ID ||
        process.env.SHOPIFY_APP_HANDLE ||
        process.env.SHOPIFY_API_KEY ||
        "product-questions-and-answers";

      const payload = {
        appId,
        event: isUpdate ? "ai_feedback.updated" : "ai_feedback.created",
        shop,
        feedback,
        aiLog,
        plan: planContext.plan,
        features: planContext.features,
        dispatchedAt: new Date().toISOString(),
      };

      const headers = {
        "Content-Type": "application/json",
      };

      const token = process.env.AUTOMATIONS_TOKEN?.trim();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const responseText = await response.text().catch(() => "Unable to read response body");
          console.error("AI Feedback Webhook Request Failed:");
          console.error("  URL:", webhookUrl);
          console.error("  Status:", response.status, response.statusText);
          console.error("  Shop:", shop);
          console.error("  Event:", payload.event);
          console.error("  Headers:", JSON.stringify(headers, null, 2));
          console.error("  Response:", responseText.substring(0, 500) + (responseText.length > 500 ? "..." : ""));
        }
      } catch (error) {
        console.error("Failed to send AI feedback webhook:", error.message);
        console.error("  URL:", webhookUrl);
        console.error("  Shop:", shop);
        console.error("  Error Stack:", error.stack);
      }
    }

    return json({ success: true, feedback });
  } catch (error) {
    console.error("Failed to save AI feedback:", error);
    return json({ error: "Failed to save feedback." }, { status: 500 });
  }
}
