import { json } from "@remix-run/node";
import { createHash } from "node:crypto";
import { cors } from "../lib/cors.server.js";
import prisma from "../db.server";
import { triggerWebhook } from "../lib/webhook.server.js";
import { resolvePublicShopDomain } from "../lib/shop-domain.server.js";

function normalizeIdentifier(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.includes("@")) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

function extractClientIp(request) {
  const headers = request.headers;
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ip = forwardedFor.split(",")[0].trim();
    if (ip) {
      return ip;
    }
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    const ip = realIp.trim();
    if (ip) {
      return ip;
    }
  }

  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) {
    const ip = cfIp.trim();
    if (ip) {
      return ip;
    }
  }

  return "";
}

function extractUserAgent(request) {
  const ua = request.headers.get("user-agent");
  return typeof ua === "string" ? ua.trim() : "";
}

function resolveIdentifier({ request, shop, identifier, customerEmail, customerId }) {
  const normalized =
    normalizeIdentifier(identifier) ||
    normalizeIdentifier(customerEmail) ||
    normalizeIdentifier(customerId);

  if (normalized) {
    return normalized;
  }

  const ip = extractClientIp(request);
  const userAgent = extractUserAgent(request);

  if (!ip && !userAgent) {
    return "";
  }

  const base = `${shop || "unknown"}|${ip}|${userAgent}`;
  return createHash("sha256").update(base).digest("hex");
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const questionId = (url.searchParams.get("questionId") || "").trim();
  const shop = resolvePublicShopDomain(request, url.searchParams.get("shop"));

  if (!questionId || !shop) {
    return cors(request, json({ hasVoted: false, votes: 0 }, { status: 200 }));
  }

  const identifier = resolveIdentifier({
    request,
    shop,
    identifier: url.searchParams.get("identifier"),
    customerEmail: url.searchParams.get("customerEmail"),
    customerId: url.searchParams.get("customerId"),
  });

  if (!identifier) {
    return cors(request, json({ hasVoted: false, votes: 0 }, { status: 200 }));
  }

  const [vote, question] = await Promise.all([
    prisma.voteLog.findUnique({
      where: {
        questionId_identifier_shop: {
          questionId,
          identifier,
          shop,
        },
      },
    }),
    prisma.question.findFirst({
      where: { id: questionId, shop },
      select: { votes: true },
    }),
  ]);

  return cors(
    request,
    json({
      hasVoted: Boolean(vote),
      votes: question?.votes ?? 0,
    }),
  );
}

export async function action({ request }) {
  const formData = await request.formData();
  const questionIdRaw = formData.get("questionId");
  const shopRaw = formData.get("shop");
  const questionId = typeof questionIdRaw === "string" ? questionIdRaw.trim() : "";
  const shop = resolvePublicShopDomain(request, shopRaw);
  const customerEmailRaw = formData.get("customerEmail");
  const customerIdRaw = formData.get("customerId");
  const identifier = resolveIdentifier({
    request,
    shop,
    identifier: formData.get("identifier"),
    customerEmail: customerEmailRaw,
    customerId: customerIdRaw,
  });
  const rawVote = formData.get("vote");
  const voteValue = rawVote === null ? 1 : Number(rawVote);

  if (!questionId || !shop || !identifier || !Number.isFinite(voteValue)) {
    return cors(request, json({ error: "Missing required fields" }, { status: 400 }));
  }

  try {
    let resultVotes = 0;
    let alreadyVoted = false;
    let recordedVote = null;
    let questionMissing = false;

    await prisma.$transaction(async (tx) => {
      const scopedQuestion = await tx.question.findFirst({
        where: { id: questionId, shop },
        select: {
          id: true,
          productId: true,
          question: true,
          customerName: true,
          customerEmail: true,
          votes: true,
        },
      });

      if (!scopedQuestion) {
        questionMissing = true;
        return;
      }

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
        alreadyVoted = true;
        resultVotes = scopedQuestion.votes ?? 0;
        return;
      }

      recordedVote = await tx.voteLog.create({
        data: {
          questionId,
          shop,
          identifier,
        },
      });

      const updatedQuestion = await tx.question.update({
        where: { id: questionId, shop },
        data: { votes: { increment: voteValue > 0 ? 1 : -1 } },
        select: { id: true, productId: true, question: true, customerName: true, customerEmail: true, votes: true },
      });

      resultVotes = updatedQuestion?.votes ?? 0;
      if (updatedQuestion) {
        recordedVote = {
          ...recordedVote,
          question: updatedQuestion,
        };
      }
    });

    if (questionMissing) {
      return cors(request, json({ error: "Question not found" }, { status: 404 }));
    }

    if (alreadyVoted) {
      return cors(request, json({ success: false, error: "already voted", votes: resultVotes }));
    }

    if (recordedVote?.question) {
      const payload = {
        action: "vote",
        entity: "question",
        shop,
        data: {
          questionId,
          totalVotes: resultVotes,
          question: recordedVote.question,
          vote: {
            identifier,
            direction: voteValue > 0 ? "up" : "down",
            customerEmail: typeof customerEmailRaw === "string" ? customerEmailRaw.trim() || null : null,
            customerId: typeof customerIdRaw === "string" ? customerIdRaw.trim() || null : null,
          },
        },
      };

      await triggerWebhook(shop, "newVote", payload);
    }

    return cors(request, json({ success: true, votes: resultVotes }));
  } catch (error) {
    console.error("Vote API error:", error);
    return cors(request, json({ error: "Failed to register vote" }, { status: 500 }));
  }
}
