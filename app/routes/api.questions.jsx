import { json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../shopify.server";

const prisma = new PrismaClient();

const GET_PRODUCT_DETAILS_QUERY = `
  query getProductDetails($id: ID!) {
    product(id: $id) {
      productType
      tags
    }
  }
`;

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  try {
    const questions = await prisma.question.findMany({
      where: {
        shop: session.shop,
        ...(productId && { productId }),
      },
      include: {
        answers: {
          where: { isPublished: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return json({ questions });
  } catch (error) {
    console.error("Error fetching questions:", error);
    return json({ error: "Failed to fetch questions" }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const method = request.method;

  try {
    if (method === "POST") {
      const productId = formData.get("productId");
      const customerName = formData.get("customerName");
      const customerEmail = formData.get("customerEmail");
      const question = formData.get("question");
      const isPublished = formData.get("isPublished") === "true";

      let productType = null;
      let productCategory = null;
      let productTags = null;

      // Fetch product details from Shopify
      try {
        const response = await admin.graphql(GET_PRODUCT_DETAILS_QUERY, {
          variables: { id: `gid://shopify/Product/${productId}` },
        });

        const productDetails = await response.json();
        const product = productDetails.data?.product;

        if (product) {
          productType = product.productType;
          productTags = product.tags?.join(', ');
          // Use product type as fallback category
          productCategory = productType ? productType.charAt(0).toUpperCase() + productType.slice(1) : null;
        }
      } catch (productError) {
        console.warn("Failed to fetch product details from Shopify:", productError.message);
        // Continue without product details
      }

      const newQuestion = await prisma.question.create({
        data: {
          shop: session.shop,
          productId,
          customerName,
          customerEmail,
          question,
          isPublished,
          productType,
          productCategory,
          productTags,
        },
      });

      return json({ question: newQuestion });
    }

    if (method === "PUT") {
      const id = formData.get("id");
      const isPublished = formData.get("isPublished") === "true";

      const updatedQuestion = await prisma.question.update({
        where: { id },
        data: { isPublished },
      });

      return json({ question: updatedQuestion });
    }

    if (method === "DELETE") {
      const id = formData.get("id");

      await prisma.question.delete({
        where: { id },
      });

      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    console.error("Error handling question action:", error);
    return json({ error: "Failed to handle request" }, { status: 500 });
  }
};