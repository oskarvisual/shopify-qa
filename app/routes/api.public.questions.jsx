import { json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import { cors } from "remix-utils/cors";
import { triggerWebhook } from "../../lib/webhook.server.js";
import { shopify } from "../shopify.server";

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
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);
  const skip = (page - 1) * limit;

  if (!productId || !shop) {
    return json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const questions = await prisma.question.findMany({
      where: {
        shop,
        productId,
        isPublished: true,
      },
      skip,
      take: limit,
      include: {
        answers: {
          where: { isPublished: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const response = json({ questions });
    return cors(request, response);
  } catch (error) {
    console.error("Error fetching questions:", error);
    const errorResponse = json({ error: "Failed to fetch questions" }, { status: 500 });
    return cors(request, errorResponse);
  }
};

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    const response = json({ error: "Method not allowed" }, { status: 405 });
    return cors(request, response);
  }

  const formData = await request.formData();
  const productId = formData.get("productId");
  const shop = formData.get("shop");
  const customerName = formData.get("customerName");
  const customerEmail = formData.get("customerEmail");
  const question = formData.get("question");

  if (!productId || !shop || !question) {
    const response = json({ error: "Missing required fields" }, { status: 400 });
    return cors(request, response);
  }

  try {
    let productType = null;
    let productCategory = null;
    let productTags = null;

    // Get product details securely using stored session
    try {
      // Find a valid session for this shop
      const session = await prisma.session.findFirst({
        where: {
          shop: shop
        },
        orderBy: { id: 'desc' }
      });

      if (session && session.accessToken) {
        console.log(`Found session for shop ${shop}, attempting to fetch product ${productId} - v3`);

        // Use REST API to fetch product details
        const productResponse = await fetch(`https://${shop}/admin/api/2023-10/products/${productId}.json`, {
          headers: {
            'X-Shopify-Access-Token': session.accessToken,
            'Content-Type': 'application/json',
          },
        });

        if (productResponse.ok) {
          const productData = await productResponse.json();
          console.log(`Successfully fetched product data:`, productData.product);

          if (productData.product) {
            productType = productData.product.product_type;
            productTags = productData.product.tags || null;
            console.log(`Product type: ${productType}, tags: ${productTags}`);

            // Fetch product collections using REST API - try different approach
            const collectionsResponse = await fetch(`https://${shop}/admin/api/2023-10/collections.json?product_id=${productId}`, {
              headers: {
                'X-Shopify-Access-Token': session.accessToken,
                'Content-Type': 'application/json',
              },
            });

            if (collectionsResponse.ok) {
              const collectionsData = await collectionsResponse.json();
              console.log(`Successfully fetched collections:`, collectionsData.collections);

              // Get the first non-automated collection as the main category
              const mainCollection = collectionsData.collections?.find(
                collection => collection.title !== 'All' && !collection.title.toLowerCase().includes('automated')
              );

              if (mainCollection) {
                productCategory = mainCollection.title;
                console.log(`Main collection/category: ${productCategory}`);
              }
            } else {
              console.warn(`Failed to fetch collections for product ${productId}: HTTP ${collectionsResponse.status} - ${collectionsResponse.statusText}`);
              // Fallback: Use product_type as category if no collections are available
              productCategory = productType ? productType.charAt(0).toUpperCase() + productType.slice(1) : null;
              console.log(`Using product type as fallback category: ${productCategory}`);
            }
          }
        } else {
          console.warn(`Failed to fetch product ${productId}: HTTP ${productResponse.status}`);
        }
      } else {
        console.warn(`No valid session found for shop ${shop}`);
      }
    } catch (sessionError) {
      console.warn("Failed to get session for product lookup:", sessionError.message);
    }

    const newQuestion = await prisma.question.create({
      data: {
        shop,
        productId,
        customerName,
        customerEmail,
        question,
        productType,
        productCategory,
        productTags,
      },
      include: { answers: true }, // Include answers for the webhook payload
    });

    // Trigger webhook
    await triggerWebhook({
      shop,
      type: "question.created",
      payload: newQuestion,
    });

    const response = json({ question: newQuestion });
    return cors(request, response);
  } catch (error) {
    console.error("Error creating question:", error);
    const errorResponse = json({ error: "Failed to create question" }, { status: 500 });
    return cors(request, errorResponse);
  }
};
