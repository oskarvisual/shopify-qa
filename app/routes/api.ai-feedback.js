import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { dispatchWebhookAutomation } from "../lib/automation.server";
import { getSubscriptionPlanContext } from "../lib/plans.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const adminUserId = session.userId ?? session.id;
  const adminUserName = session.firstName || 'Admin';
  const { shop } = session;

  const { aiLogId, rating, feedbackText } = await request.json();

  if (!aiLogId || rating === undefined) {
    return json({ error: "Missing aiLogId or rating" }, { status: 400 });
  }

  try {
    // Check if this admin already has feedback for this log
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
      // Update existing feedback
      feedback = await prisma.aiFeedback.update({
        where: { id: existingFeedback.id },
        data: {
          rating,
          feedbackText,
        },
      });
    } else {
      // Create new feedback
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

      await dispatchWebhookAutomation({
        shop,
        topic: "ai_feedback",
        target: webhookUrl,
        payload: {
          event: isUpdate ? "ai_feedback.updated" : "ai_feedback.created",
          shop,
          feedback,
          aiLog,
        },
        headers: {
          "Content-Type": "application/json",
        },
        meta: {
          plan: planContext.plan,
          features: planContext.features,
        },
      });
    }

    return json({ success: true, feedback });
  } catch (error) {
    console.error("Failed to save AI feedback:", error);
    return json({ error: "Failed to save feedback." }, { status: 500 });
  }
};
