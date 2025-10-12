import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { generateAnswer } from "../lib/ai.server.js";
import { getStoreContext } from "../lib/store-context.server.js";
import { PlanFeature, planHasFeature } from "../lib/plans";
import { getSubscriptionPlanContext } from "../lib/plans.server";

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
  const { session, admin } = await authenticate.admin(request);
  const { shop, subscriptionPlan } = session;
  const planContext = await getSubscriptionPlanContext({ shop, sessionPlan: subscriptionPlan });
  const aiEnabledForPlan = planHasFeature(planContext.features, PlanFeature.ADMIN_AI);

  const { customerQuestion, productId, questionId } = await request.json();

  if (!customerQuestion || !productId || !questionId) {
    return json({ error: "customerQuestion, productId, and questionId are required." }, { status: 400 });
  }

  try {
    // 1. Fetch AI Settings from DB
    const aiSettings = await prisma.aiSetting.findUnique({ where: { shop } });

    if (!aiEnabledForPlan || !aiSettings?.aiEnabled) {
      return json({ answer: "AI-powered answers are currently disabled by the administrator." });
    }

    // 2. Fetch Product Details from Shopify API
    const productResponse = await admin.graphql(GET_PRODUCT_DETAILS_QUERY, {
      variables: { id: `gid://shopify/Product/${productId}` },
    });
    const productData = await productResponse.json();
    const product = {
        title: productData.data?.product?.title,
        description: productData.data?.product?.descriptionHtml.replace(/<[^>]*>?/gm, '\n').trim(),
        options: productData.data?.product?.options || [],
        variants: productData.data?.product?.variants?.nodes || [],
    };

    // 3. Fetch store-level context (payments, shipping, etc.)
    const store = await getStoreContext({ shop, admin });

    // 4. Prepare the context object
    const context = {
      customerQuestion,
      product,
      aiSettings,
      shop,
      productId,
      questionId,
      store,
      planContext,
    };

    // 5. Generate the answer
    const { message, hasAnswer } = await generateAnswer(context);

    return json({ answer: hasAnswer, message });
  } catch (error) {
    console.error("AI Answer API Error:", error);
    return json({ error: "Failed to generate AI answer." }, { status: 500 });
  }
}
