import { json } from "@remix-run/node";
import prisma from "../db.server";
import { generateAnswer } from "../lib/ai.server.js";
import { unauthenticated } from "../shopify.server";
import { PlanFeature, planHasFeature } from "../lib/plans";
import { getSubscriptionPlanContext } from "../lib/plans.server";
import { getStoreContext } from "../lib/store-context.server.js";

const GET_PRODUCT_DETAILS_QUERY = `
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      descriptionHtml
      options(first: 5) {
        name
        values
      }
      variants(first: 20) {
        nodes {
          title
          availableForSale
        }
      }
    }
  }
`;

export async function action({ request }) {
  // Note: No admin session authentication here, this is a public endpoint.
  const { customerQuestion, productId, shop } = await request.json();

  if (!customerQuestion || !productId || !shop) {
    return json({ error: "customerQuestion, productId, and shop are required." }, { status: 400 });
  }

  try {
    const planContext = await getSubscriptionPlanContext({ shop });
    const aiEnabledForPlan = planHasFeature(planContext.features, PlanFeature.FRONTEND_AI);

    // 1. Fetch AI Settings from DB
    const aiSettings = await prisma.aiSetting.findUnique({ where: { shop } });

    if (!aiEnabledForPlan || !aiSettings?.aiEnabled) {
      return json({ answer: "AI-powered answers are currently disabled." });
    }

    // 2. Get an offline admin client for the shop
    const { admin } = await unauthenticated.admin(shop);

    // 3. Fetch Product Details from Shopify API
    const productResponse = await admin.graphql(GET_PRODUCT_DETAILS_QUERY, {
      variables: { id: `gid://shopify/Product/${productId}` },
    });

    if (!productResponse.ok) {
      throw new Error(`Failed to fetch product details: ${productResponse.statusText}`);
    }

    const productData = await productResponse.json();
    const product = {
        title: productData.data?.product?.title,
        description: productData.data?.product?.descriptionHtml.replace(/<[^>]*>?/gm, '\n').trim(),
        options: productData.data?.product?.options || [],
        variants: productData.data?.product?.variants?.nodes || [],
    };

    // 4. Fetch store-level context (payments, shipping, etc.)
    const store = await getStoreContext({ shop, admin });

    // 5. Prepare the context object
    const context = {
      customerQuestion,
      product,
      aiSettings,
      shop,
      productId,
      store,
      planContext,
    };

    // 6. Generate the answer & Log the interaction
    const { message, hasAnswer, fullContext, noAnswer } = await generateAnswer(context);

    const log = await prisma.aiLog.create({
      data: {
        shop,
        productId,
        customerQuestion,
        aiAnswer: message,
        fullContext,
        noAnswer,
      },
    });

    return json({ answer: hasAnswer, message, aiLogId: log.id });
  } catch (error) {
    console.error("Public AI Answer API Error:", error);
    return json({ error: "Failed to generate AI answer." }, { status: 500 });
  }
}
