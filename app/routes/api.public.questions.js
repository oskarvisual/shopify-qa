import { json } from "@remix-run/node";
import { cors } from "../lib/cors.server.js";
import { triggerWebhook } from "../lib/webhook.server.js";
import { sendNewQuestionNotification, sendQuestionPublishedNotification } from "../lib/email.server.js";
import prisma from "../db.server";

const GET_PRODUCT_DETAILS_QUERY = `
  query getProductDetails($id: ID!) {
    product(id: $id) {
      handle
      title
      productType
      tags
      inCollections(first: 10) {
        edges {
          node {
            title
          }
        }
      }
    }
    shop {
      name
    }
  }
`;

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);
  const skip = (page - 1) * limit;

  if (!productId || !shop) {
    return cors(request, json({ error: "Missing required parameters" }, { status: 400 }));
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

    return cors(request, json({ questions }));
  } catch (error) {
    console.error("Error fetching questions:", error);
    return cors(request, json({ error: "Failed to fetch questions" }, { status: 500 }));
  }
}

export async function action({ request }) {
  if (request.method !== "POST") {
    return cors(request, json({ error: "Method not allowed" }, { status: 405 }));
  }

  const formData = await request.formData();
  const productId = formData.get("productId");
  const shop = formData.get("shop");
  const question = (formData.get("question") || "").trim();
  const rawCustomerName = formData.get("customerName");
  const rawCustomerEmail = formData.get("customerEmail");

  if (!productId || !shop || !question) {
    return cors(request, json({ error: "Missing required fields" }, { status: 400 }));
  }

  const customerName = rawCustomerName ? rawCustomerName.trim() : null;
  const customerEmail = rawCustomerEmail ? rawCustomerEmail.trim() : null;

  if (!customerName || !customerEmail) {
    return cors(request, json({ error: "Name and email are required." }, { status: 400 }));
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customerEmail)) {
    return cors(request, json({ error: "Please provide a valid email address." }, { status: 400 }));
  }

  try {
    let productType = null;
    let productCategory = null;
    let productTags = null;
    let productHandle = null;
    let productName = null;
    let storeName = null;

    try {
      const session = await prisma.session.findFirst({
        where: { shop },
        orderBy: { id: "desc" },
      });

      if (session?.accessToken) {
        const graphqlResponse = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": session.accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: GET_PRODUCT_DETAILS_QUERY,
            variables: { id: `gid://shopify/Product/${productId}` },
          }),
        });

        if (graphqlResponse.ok) {
          const responseData = await graphqlResponse.json();
          const product = responseData.data?.product;
          storeName = responseData.data?.shop?.name || null;

          if (product) {
            productType = product.productType;
            productTags = product.tags?.join(', ') || null;
            productHandle = product.handle || null;
            productName = product.title || null;

            // Get the first non-"All" collection as the category
            const collections = product.inCollections?.edges || [];
            const mainCollection = collections.find(
              (edge) => edge.node.title !== "All" && !edge.node.title.toLowerCase().includes("automated")
            );

            if (mainCollection) {
              productCategory = mainCollection.node.title;
            } else if (productType) {
              productCategory = productType.charAt(0).toUpperCase() + productType.slice(1);
            }
          }
        }
      }
    } catch (sessionError) {
      console.warn("Failed to get session for product lookup:", sessionError.message);
    }

    const emailSettings = await prisma.emailSetting.findUnique({ where: { shop } });

    const newQuestion = await prisma.question.create({
      data: {
        shop,
        productId,
        customerName,
        customerEmail,
        question,
        isPublished: emailSettings?.autoApproveQuestions || false,
        productType,
        productCategory,
        productTags,
      },
      include: { answers: true },
    });

    await triggerWebhook(shop, "newQuestion", {
      action: "create",
      entity: "question",
      shop,
      data: newQuestion,
    });

    await sendNewQuestionNotification(shop, newQuestion, {
      questionPath: `/app/questions/${newQuestion.id}`,
      storeName,
    });

    if (newQuestion.isPublished) {
      await sendQuestionPublishedNotification(shop, newQuestion, {
        productHandle,
        storeName,
        productName,
      });
    }

    return cors(request, json({ question: newQuestion }));
  } catch (error) {
    console.error("Failed to create question:", error);
    return cors(request, json({ error: "Failed to create question" }, { status: 500 }));
  }
}
