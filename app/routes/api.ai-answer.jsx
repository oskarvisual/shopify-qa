import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { generateAnswer } from "../lib/ai.server.js";
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

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const aiUsageToday = await prisma.aiLog.count({ where: { shop, createdAt: { gte: startOfDay } } });

    if (aiUsageToday >= planContext.aiDailyLimit) {
      return json({ answer: "The daily AI answer limit has been reached. Please try again tomorrow." });
    }

    // 2. Fetch other Q&As for this product for context
    const otherQuestions = await prisma.question.findMany({
      where: {
        productId: productId,
        id: { not: questionId },
        isPublished: true,
        answers: { some: { isPublished: true } },
      },
      include: {
        answers: {
          where: { isPublished: true },
          orderBy: { createdAt: 'desc' },
          take: 1, // Take the most recent published answer
        },
      },
      take: 5, // Limit to 5 other questions for context
      orderBy: { createdAt: 'desc' },
    });

    const previousQAs = otherQuestions.map(q => ({
      question: q.question,
      answer: q.answers[0]?.answer || 'No answer available.',
    }));

    // 3. Fetch Product Details from Shopify API
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

    // 4. Prepare the context object
    const context = {
      customerQuestion,
      product,
      previousQAs,
      aiSettings,
    };

    // 5. Generate the answer
    const { answer, fullContext } = await generateAnswer(context);

    return json({ answer });
  } catch (error) {
    console.error("AI Answer API Error:", error);
    return json({ error: "Failed to generate AI answer." }, { status: 500 });
  }
}
