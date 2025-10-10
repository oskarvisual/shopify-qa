import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

    const webhookConfig = await prisma.config.findUnique({ where: { key: "admin.webhook_ai_feedback" } });
    const webhookUrl = webhookConfig?.value?.trim();

    if (webhookUrl) {
      try {
        // Fetch the AI log with full context for the webhook
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

        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: isUpdate ? "ai_feedback.updated" : "ai_feedback.created",
            shop,
            feedback,
            aiLog,
          }),
        });
      } catch (webhookError) {
        console.error(`Failed to notify AI feedback webhook at ${webhookUrl}:`, webhookError);
      }
    }

    return json({ success: true, feedback });
  } catch (error) {
    console.error("Failed to save AI feedback:", error);
    return json({ error: "Failed to save feedback." }, { status: 500 });
  }
};
