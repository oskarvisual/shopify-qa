import { json } from "@remix-run/node";
import prisma from "../db.server";
import { cors } from "remix-utils/cors";
import { triggerWebhook } from "../lib/webhook.server";

// GET method to check vote status
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const questionId = url.searchParams.get("questionId");
  const shop = url.searchParams.get("shop");
  const customerEmail = url.searchParams.get("customerEmail");

  if (!questionId || !shop) {
    const response = json({ error: "Missing required fields" }, { status: 400 });
    return cors(request, response);
  }

  try {
    // Use IP + email as identifier for better uniqueness
    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
    const identifier = `${ip}:${customerEmail || 'anonymous'}`;

    const existingVote = await prisma.voteLog.findFirst({
      where: {
        questionId,
        identifier,
        shop,
      },
    });

    const response = json({ hasVoted: !!existingVote });
    return cors(request, response);
  } catch (error) {
    console.error("Error checking vote status:", error);
    const errorResponse = json({ error: "Failed to check vote status" }, { status: 500 });
    return cors(request, errorResponse);
  }
};

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    const response = json({ error: "Method not allowed" }, { status: 405 });
    return cors(request, response);
  }

  const formData = await request.formData();
  const questionId = formData.get("questionId");
  const shop = formData.get("shop");
  const customerEmail = formData.get("customerEmail");

  // Use IP + email as identifier for better uniqueness
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
  const identifier = `${ip}:${customerEmail || 'anonymous'}`;

  if (!questionId || !shop) {
    const response = json({ error: "Missing required fields" }, { status: 400 });
    return cors(request, response);
  }

  try {
    let newVoteCount;

    // Use a transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // 1. Check if this identifier has already voted for this question
      const existingVote = await tx.voteLog.findFirst({
        where: {
          questionId,
          identifier,
          shop,
        },
      });

      if (existingVote) {
        // By throwing an error, the transaction is rolled back.
        throw new Error("Already voted");
      }

      // 2. If no vote exists, update the question's vote count
      const updatedQuestion = await tx.question.update({
        where: { id: questionId },
        data: { votes: { increment: 1 } },
      });

      newVoteCount = updatedQuestion.votes;

      // 3. Create a log entry
      await tx.voteLog.create({
        data: {
          questionId,
          identifier,
          shop,
        },
      });
    });

    // Trigger webhook after the transaction is successful
    await triggerWebhook(shop, "newVote", {
      action: "create",
      entity: "vote",
      shop,
      data: {
        questionId,
        customerEmail,
        votes: newVoteCount,
        timestamp: new Date()
      }
    });

    const response = json({ success: true, votes: newVoteCount });
    return cors(request, response);

  } catch (error) {
    // If the error is "Already voted", return a specific message
    if (error.message === "Already voted") {
      const response = json({ success: false, error: "You have already voted for this question." }, { status: 409 });
      return cors(request, response);
    }

    // For other errors
    console.error("Error processing vote:", error);
    const errorResponse = json({ success: false, error: "Failed to process vote." }, { status: 500 });
    return cors(request, errorResponse);
  }
};
