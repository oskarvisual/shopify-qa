import { json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../shopify.server";

const prisma = new PrismaClient();

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

      const newAnswer = await prisma.answer.create({
        data: {
          questionId,
          authorName,
          authorEmail,
          answer,
        },
      });

      return json({ answer: newAnswer });
    }

    if (method === "PUT") {
      const id = formData.get("id");
      const isPublished = formData.get("isPublished") === "true";

      const updatedAnswer = await prisma.answer.update({
        where: { id },
        data: { isPublished },
      });

      return json({ answer: updatedAnswer });
    }

    if (method === "DELETE") {
      const id = formData.get("id");

      await prisma.answer.delete({
        where: { id },
      });

      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    console.error("Error handling answer action:", error);
    return json({ error: "Failed to handle request" }, { status: 500 });
  }
};