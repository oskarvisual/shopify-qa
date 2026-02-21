import { json } from "@remix-run/node";
import { cors } from "../lib/cors.server.js";
import prisma from "../db.server";

export async function action({ request }) {
  const { aiLogId, shop, vote, askedHuman } = await request.json();

  if (!aiLogId || !shop) {
    return cors(request, json({ error: "aiLogId and shop are required" }, { status: 400 }));
  }

  try {
    const dataToUpdate = {};
    if (vote !== undefined) {
      const voteValue = Number(vote);
      if (!Number.isFinite(voteValue) || ![-1, 1].includes(voteValue)) {
        return cors(request, json({ error: "vote must be -1 or 1" }, { status: 400 }));
      }
      dataToUpdate.vote = voteValue;
    }
    if (askedHuman !== undefined) {
      dataToUpdate.askedHuman = Boolean(askedHuman);
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return cors(request, json({ error: "Nothing to update" }, { status: 400 }));
    }

    const updateResult = await prisma.aiLog.updateMany({
      where: { id: aiLogId, shop },
      data: dataToUpdate,
    });

    if (updateResult.count === 0) {
      return cors(request, json({ error: "AI log not found" }, { status: 404 }));
    }

    const updatedLog = await prisma.aiLog.findFirst({
      where: { id: aiLogId, shop },
      select: {
        id: true,
        vote: true,
        askedHuman: true,
        updatedAt: true,
      },
    });

    return cors(request, json({ success: true, log: updatedLog }));
  } catch (error) {
    console.error("AI Log Update Error:", error);
    const errorResponse = json({ error: "Failed to update AI log" }, { status: 500 });
    return cors(request, errorResponse);
  }
}
