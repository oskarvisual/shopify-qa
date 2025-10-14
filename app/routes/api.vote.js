import { json } from "@remix-run/node";
import { cors } from "../lib/cors.server.js";
import prisma from "../db.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const questionId = url.searchParams.get("questionId");
  const shop = url.searchParams.get("shop");
  const identifier = url.searchParams.get("identifier");

  if (!questionId || !shop || !identifier) {
    return cors(request, json({ voted: false }, { status: 200 }));
  }

  const vote = await prisma.voteLog.findUnique({
    where: {
      questionId_identifier_shop: {
        questionId,
        identifier,
        shop,
      },
    },
  });

  return cors(request, json({ voted: Boolean(vote) }));
}

export async function action({ request }) {
  const formData = await request.formData();
  const questionId = formData.get("questionId");
  const shop = formData.get("shop");
  const identifier = formData.get("identifier");
  const voteValue = Number(formData.get("vote"));

  if (!questionId || !shop || !identifier || !Number.isFinite(voteValue)) {
    return cors(request, json({ error: "Missing required fields" }, { status: 400 }));
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existingVote = await tx.voteLog.findUnique({
        where: {
          questionId_identifier_shop: {
            questionId,
            identifier,
            shop,
          },
        },
      });

      if (existingVote) {
        return;
      }

      await tx.voteLog.create({
        data: {
          questionId,
          shop,
          identifier,
        },
      });

      await tx.question.update({
        where: { id: questionId },
        data: { votes: { increment: voteValue > 0 ? 1 : -1 } },
      });
    });

    return cors(request, json({ success: true }));
  } catch (error) {
    console.error("Vote API error:", error);
    return cors(request, json({ error: "Failed to register vote" }, { status: 500 }));
  }
}
