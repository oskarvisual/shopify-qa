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
    const aiSettings = await prisma.aiSetting.findUnique({ where: { shop } });

    if (!aiEnabledForPlan || !aiSettings?.aiEnabled) {
      return json({ answer: "AI-powered answers are currently disabled by the administrator." });
    }

    const productResponse = await admin.graphql(GET_PRODUCT_DETAILS_QUERY, {
      variables: { id: `gid://shopify/Product/${productId}` },
    });
    const productData = await productResponse.json();
    const product = {
      title: productData.data?.product?.title,
      description: productData.data?.product?.descriptionHtml.replace(/<[^>]*>?/gm, "\n").trim(),
      options: productData.data?.product?.options || [],
      variants: productData.data?.product?.variants?.nodes || [],
    };

    const store = await getStoreContext({ shop, admin });

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

    const { message, hasAnswer, fullContext, noAnswer } = await generateAnswer(context);

    // Save to AI log for admin requests too
    try {
      await prisma.aiLog.create({
        data: {
          shop,
          productId,
          customerQuestion,
          aiAnswer: message,
          fullContext,
          noAnswer,
        },
      });
    } catch (logError) {
      console.error("Failed to save AI log for admin request:", logError);
      // Don't fail the request if logging fails
    }

    return json({ answer: hasAnswer, message });
  } catch (error) {
    console.error("AI Answer API Error:", error);
    return json({ error: "Failed to generate AI answer." }, { status: 500 });
  }
}
