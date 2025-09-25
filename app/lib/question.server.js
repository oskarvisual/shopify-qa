
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GET_PRODUCT_DETAILS_QUERY = `
  query getProductDetails($id: ID!) {
    product(id: $id) {
      productType
      tags
    }
  }
`;

/**
 * Creates a new question, fetching product details from Shopify.
 * @param {object} questionData - The data for the question.
 * @param {object} admin - The Shopify admin API client.
 * @returns {Promise<object>} The created question.
 */
export async function createQuestion(questionData, admin) {
  const { shop, productId, customerName, customerEmail, question, isPublished = false } = questionData;

  if (!shop || !productId || !question) {
    throw new Error("Missing required fields: shop, productId, and question are required.");
  }

  let productCategory = null;
  let productTags = null;

  // Try to fetch product details from Shopify if admin client is available
  if (admin) {
    try {
      const response = await admin.graphql(GET_PRODUCT_DETAILS_QUERY, {
        variables: { id: `gid://shopify/Product/${productId}` },
      });

      const productDetails = await response.json();
      const product = productDetails.data?.product;

      productCategory = product?.productType;
      productTags = product?.tags?.join(', '); // Store tags as a comma-separated string
    } catch (error) {
      console.warn("Failed to fetch product details from Shopify:", error.message);
      // Continue without product details
    }
  }

  // Create the question in the database
  const newQuestion = await prisma.question.create({
    data: {
      shop,
      productId,
      customerName,
      customerEmail,
      question,
      isPublished,
      productCategory,
      productTags,
    },
  });

  return newQuestion;
}
