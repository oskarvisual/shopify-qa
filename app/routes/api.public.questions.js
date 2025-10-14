import { json } from "@remix-run/node";
import { cors } from "../lib/cors.server.js";
import { triggerWebhook } from "../lib/webhook.server.js";
import { sendNewQuestionNotification, sendQuestionPublishedNotification } from "../lib/email.server.js";
import prisma from "../db.server";

const GET_PRODUCT_DETAILS_QUERY = `
  query getProductDetails($id: ID!) {
    product(id: $id) {
      productType
      tags
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
        const productResponse = await fetch(`https://${shop}/admin/api/2023-10/products/${productId}.json`, {
          headers: {
            "X-Shopify-Access-Token": session.accessToken,
            "Content-Type": "application/json",
          },
        });

        if (productResponse.ok) {
          const productData = await productResponse.json();
          if (productData.product) {
            productType = productData.product.product_type;
            productTags = productData.product.tags || null;
            productHandle = productData.product.handle || null;
            productName = productData.product.title || null;

            const collectionsResponse = await fetch(`https://${shop}/admin/api/2023-10/collections.json?product_id=${productId}`, {
              headers: {
                "X-Shopify-Access-Token": session.accessToken,
                "Content-Type": "application/json",
              },
            });

            if (collectionsResponse.ok) {
              const collectionsData = await collectionsResponse.json();
              const mainCollection = collectionsData.collections?.find(
                (collection) => collection.title !== "All" && !collection.title.toLowerCase().includes("automated")
              );

              if (mainCollection) {
                productCategory = mainCollection.title;
              }
            } else if (productType) {
              productCategory = productType.charAt(0).toUpperCase() + productType.slice(1);
            }
          }

          if (!storeName) {
            try {
              const shopResponse = await fetch(`https://${shop}/admin/api/2023-10/shop.json`, {
                headers: {
                  "X-Shopify-Access-Token": session.accessToken,
                  "Content-Type": "application/json",
                },
              });

              if (shopResponse.ok) {
                const shopData = await shopResponse.json();
                storeName = shopData.shop?.name || null;
              }
            } catch (shopError) {
              console.warn("Failed to fetch shop details:", shopError.message);
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
