import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { sendNewAnswerNotification } from "../lib/email.server.js";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const method = request.method;

  try {
    if (method === "POST") {
      const questionId = formData.get("questionId");
      const authorName = formData.get("authorName");
      const authorEmail = formData.get("authorEmail");
      const answer = formData.get("answer");
      const notifyCustomer = formData.get("notifyCustomer") === "true";

      const newAnswer = await prisma.answer.create({
        data: {
          shop: session.shop,
          questionId,
          authorName,
          authorEmail,
          answer,
        },
      });

      // If notify customer is checked, send the email
      if (notifyCustomer) {
        const question = await prisma.question.findUnique({ where: { id: questionId } });
        if (question) {
          await sendNewAnswerNotification(session.shop, question, newAnswer);
        }
      }

      return json({ answer: newAnswer });
    }

    if (method === "PUT") {
      const id = formData.get("id");
      const isPublished = formData.get("isPublished") === "true";

      const updatedAnswer = await prisma.answer.update({
        where: { id, shop: session.shop },
        data: { isPublished },
      });

      return json({ answer: updatedAnswer });
    }

    if (method === "DELETE") {
      const id = formData.get("id");

      await prisma.answer.delete({
        where: { id, shop: session.shop },
      });

      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    console.error("Error handling answer action:", error);
    return json({ error: "Failed to handle request" }, { status: 500 });
  }
};