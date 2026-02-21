import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { sendNewAnswerNotification } from "../lib/email.server.js";

const GET_PRODUCT_HANDLE_AND_SHOP_QUERY = `
  query getProductHandleAndShop($productId: ID!) {
    product(id: $productId) {
      handle
    }
    shop {
      name
    }
  }
`;

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const method = request.method;

  try {
    if (method === "POST") {
      const questionId = (formData.get("questionId") || "").trim();
      const authorName = (formData.get("authorName") || "").trim();
      const authorEmail = (formData.get("authorEmail") || "").trim();
      const answer = (formData.get("answer") || "").trim();
      const notifyCustomer = formData.get("notifyCustomer") === "true";

      if (!questionId) {
        return json({ error: "Question is required." }, { status: 400 });
      }
      if (!answer) {
        return json({ error: "Answer text is required." }, { status: 400 });
      }
      if (!authorName) {
        return json({ error: "Author name is required." }, { status: 400 });
      }
      if (!authorEmail) {
        return json({ error: "Author email is required." }, { status: 400 });
      }

      const question = await prisma.question.findFirst({
        where: {
          id: questionId,
          shop: session.shop,
        },
      });

      if (!question) {
        return json({ error: "Question not found." }, { status: 404 });
      }

      const newAnswer = await prisma.answer.create({
        data: {
          shop: session.shop,
          questionId: question.id,
          authorName,
          authorEmail,
          answer,
        },
      });

      if (notifyCustomer) {
        let productHandle;
        let storeName;
        if (question.productId) {
          try {
            const productResponse = await admin.graphql(GET_PRODUCT_HANDLE_AND_SHOP_QUERY, {
              variables: { productId: `gid://shopify/Product/${question.productId}` },
            });
            const productData = await productResponse.json();
            productHandle = productData.data?.product?.handle;
            storeName = productData.data?.shop?.name;
          } catch (productError) {
            console.error("Failed to fetch product details for answer notification:", productError);
          }
        }

        await sendNewAnswerNotification(session.shop, question, newAnswer, {
          productHandle,
          storeName,
        });
      }

      return json({ answer: newAnswer });
    }

    if (method === "PUT") {
      const id = (formData.get("id") || "").trim();
      const isPublished = formData.get("isPublished") === "true";

      if (!id) {
        return json({ error: "Answer identifier is required." }, { status: 400 });
      }

      const updatedAnswer = await prisma.answer.update({
        where: { id, shop: session.shop },
        data: { isPublished },
      });

      return json({ answer: updatedAnswer });
    }

    if (method === "DELETE") {
      const id = (formData.get("id") || "").trim();

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
}
