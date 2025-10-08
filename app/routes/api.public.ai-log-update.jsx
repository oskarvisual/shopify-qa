import { json } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import prisma from "../db.server";

export async function action({ request }) {
  const { aiLogId, vote, askedHuman } = await request.json();

  if (!aiLogId) {
    return cors(request, json({ error: "aiLogId is required" }, { status: 400 }));
  }

  try {
    const dataToUpdate = {};
    if (vote !== undefined) {
      dataToUpdate.vote = vote;
    }
    if (askedHuman !== undefined) {
      dataToUpdate.askedHuman = askedHuman;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return cors(request, json({ error: "Nothing to update" }, { status: 400 }));
    }

    const updatedLog = await prisma.aiLog.update({
      where: { id: aiLogId },
      data: dataToUpdate,
    });

    return cors(request, json({ success: true, log: updatedLog }));
  } catch (error) {
    console.error("AI Log Update Error:", error);
    const errorResponse = json({ error: "Failed to update AI log" }, { status: 500 });
    return cors(request, errorResponse);
  }
}

// Allow POST requests
export const handle = ({ request, params, context }) => {
  if (request.method === "POST") {
    return action({ request });
  }
  return new Response("Method Not Allowed", { status: 405 });
};