import { json, redirect } from "@remix-run/node";
import { useLoaderData, Link, useNavigate, useFetcher } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Grid,
  DataTable,
  Link as PolarisLink,
  Modal,
  Thumbnail,
  Banner,
  Button,
} from "@shopify/polaris";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PlanFeature, planHasFeature } from "../lib/plans";
import { getSubscriptionPlanContext } from "../lib/plans.server";
import { usePlanFeature } from "../lib/plan-context";

function formatMilliseconds(ms) {
  if (ms < 0) ms = 0;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop, subscriptionPlan } = session;
  const planContext = await getSubscriptionPlanContext({ shop, sessionPlan: subscriptionPlan });
  const includeAdvancedMetrics = planHasFeature(planContext.features, PlanFeature.DASHBOARD_ENHANCED);
  const includeAiMetrics = planHasFeature(planContext.features, PlanFeature.DASHBOARD_AI_METRICS);

  // Check if this is the first time (for showing setup banner)
  let settings = await prisma.settings.findUnique({
    where: { shop },
  });

  if (!settings) {
    settings = await prisma.settings.create({
      data: {
        shop,
        data: "{}",
        hasSeenSetup: false,
      },
    });
  }

  const showSetupBanner = !settings.hasSeenSetup;

  // Auto-sync plan from Shopify
  let planUpdated = false;
  let updatedPlanName = null;
  try {
    const ACTIVE_SUBSCRIPTIONS_QUERY = `
      query GetActiveSubscriptions {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            lineItems {
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    price {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(ACTIVE_SUBSCRIPTIONS_QUERY);
    const data = await response.json();
    const activeSubscriptions = data?.data?.currentAppInstallation?.activeSubscriptions || [];

    // Determine the plan based on active subscriptions
    let detectedPlan = "free";
    if (activeSubscriptions.length > 0) {
      const subscription = activeSubscriptions[0];
      const subscriptionName = subscription.name?.toLowerCase() || "";

      if (subscriptionName.includes("ultra")) {
        detectedPlan = "ultra";
      } else if (subscriptionName.includes("pro")) {
        detectedPlan = "pro";
      } else {
        // Try to detect by price
        const price = parseFloat(
          subscription.lineItems?.[0]?.plan?.pricingDetails?.price?.amount || "0"
        );
        if (price >= 40) {
          detectedPlan = "ultra";
        } else if (price >= 15) {
          detectedPlan = "pro";
        }
      }
    }

    // Check current plan in database
    const currentPlanConfig = await prisma.config.findUnique({
      where: { key: `subscription.plan.${shop}` },
    });

    const currentPlan = currentPlanConfig?.value || "free";

    // If plan changed, update database
    if (detectedPlan !== currentPlan) {
      console.log(`[DASHBOARD AUTO-SYNC] Plan changed from ${currentPlan} to ${detectedPlan} for shop ${shop}`);
      await prisma.config.upsert({
        where: { key: `subscription.plan.${shop}` },
        update: { value: detectedPlan },
        create: { key: `subscription.plan.${shop}`, value: detectedPlan },
      });
      planUpdated = true;
      updatedPlanName = detectedPlan;
    }
  } catch (error) {
    console.error("[DASHBOARD AUTO-SYNC] Error syncing plan:", error);
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [publishedQuestionCount, pendingQuestionCount, totalAnswerCount, recentQuestionsActivity, recentAnswersActivity, totalQuestions, unansweredQuestionsCount, allQuestionsWithTags, voteLogs, answeredQuestions] = await Promise.all([
    prisma.question.count({ where: { shop, isPublished: true } }),
    prisma.question.count({ where: { shop, isPublished: false } }),
    prisma.answer.count({ where: { question: { shop } } }),
    prisma.question.findMany({ where: { shop, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    prisma.answer.findMany({ where: { question: { shop }, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    prisma.question.count({ where: { shop } }),
    prisma.question.count({ where: { shop, answers: { none: {} } } }),
    prisma.question.findMany({ where: { shop, AND: [{ productTags: { not: null } }, { productTags: { not: '' } }] }, select: { productTags: true } }),
    prisma.voteLog.findMany({ where: { shop, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    prisma.question.findMany({ where: { shop, answers: { some: {} } }, include: { answers: { orderBy: { createdAt: 'asc' }, take: 1 } } }),
  ]);

  let latestQuestions = [];
  let topProductsByQuestions = [];
  let topProductsByVotes = [];
  let topCategories = [];
  let topProductTypes = [];
  let activeAdmins = [];
  let topQuestionsByVotesList = [];
  let latestUnanswered = [];

  if (includeAdvancedMetrics) {
    [latestQuestions, topProductsByQuestions, topProductsByVotes, topCategories, topProductTypes, activeAdmins, topQuestionsByVotesList, latestUnanswered] = await Promise.all([
      prisma.question.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, question: true, createdAt: true } }),
      prisma.question.groupBy({ by: ["productId"], where: { shop }, _count: { productId: true }, orderBy: { _count: { productId: "desc" } }, take: 5 }),
      prisma.question.groupBy({ by: ["productId"], where: { shop }, _sum: { votes: true }, orderBy: { _sum: { votes: "desc" } }, take: 5 }),
      prisma.question.groupBy({ by: ["productCategory"], where: { shop, productCategory: { not: null } }, _count: { productCategory: true }, orderBy: { _count: { productCategory: "desc" } }, take: 5 }),
      prisma.question.groupBy({ by: ["productType"], where: { shop, productType: { not: null } }, _count: { productType: true }, orderBy: { _count: { productType: "desc" } }, take: 5 }),
      prisma.answer.groupBy({ by: ['authorEmail'], where: { question: { shop: shop }, authorEmail: { not: null } }, _count: { authorEmail: true }, orderBy: { _count: { authorEmail: 'desc' } }, take: 5 }),
      prisma.question.findMany({ where: { shop }, orderBy: { votes: 'desc' }, take: 5, select: { id: true, question: true, votes: true } }),
      prisma.question.findMany({ where: { shop, answers: { none: {} } }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, question: true, createdAt: true } }),
    ]);
  }

  let latestPositiveAi = [];
  let latestUnansweredAi = [];
  let aiLogsActivity = [];

  if (includeAiMetrics) {
    const [positive, unanswered, activity] = await Promise.all([
      prisma.aiLog.findMany({ where: { shop, vote: 1 }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.aiLog.findMany({ where: { shop, noAnswer: true }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.aiLog.findMany({ where: { shop, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true, vote: true, noAnswer: true, askedHuman: true } }),
    ]);

    latestPositiveAi = positive;
    latestUnansweredAi = unanswered;
    aiLogsActivity = activity;
  }

  const productMap = {};
  if (includeAdvancedMetrics || includeAiMetrics) {
    const productIds = [...new Set([
      ...topProductsByQuestions.map(p => p.productId),
      ...topProductsByVotes.map(p => p.productId),
      ...latestPositiveAi.map(log => log.productId),
      ...latestUnansweredAi.map(log => log.productId)
    ])];

    if (productIds.length > 0) {
      const gqlProductIds = productIds.map(id => `gid://shopify/Product/${id}`);
      const productResponse = await admin.graphql(`query getProducts($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id title } } }`, { variables: { ids: gqlProductIds } });
      const { data } = await productResponse.json();
      data.nodes?.forEach(product => { if (product) { const numericId = product.id.replace('gid://shopify/Product/', ''); productMap[numericId] = product.title; } });
    }
  }

  const unansweredRatio = totalQuestions > 0 ? (unansweredQuestionsCount / totalQuestions) * 100 : 0;
  let totalResponseTime = 0;
  answeredQuestions.forEach(q => { totalResponseTime += new Date(q.answers[0].createdAt).getTime() - new Date(q.createdAt).getTime(); });
  const averageResponseTime = answeredQuestions.length > 0 ? totalResponseTime / answeredQuestions.length : 0;

  const activityChartData = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    return { date: dateStr, day: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), questions: 0, answers: 0 };
  }).reverse();
  recentQuestionsActivity.forEach(q => { const entry = activityChartData.find(d => d.date === q.createdAt.toISOString().split('T')[0]); if (entry) entry.questions++; });
  recentAnswersActivity.forEach(a => { const entry = activityChartData.find(d => d.date === a.createdAt.toISOString().split('T')[0]); if (entry) entry.answers++; });

  const tagCounts = {};
  allQuestionsWithTags.forEach(q => {
    const tags = q.productTags.split(',').map(t => t.trim());
    tags.forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
  });
  const tagDistribution = Object.entries(tagCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  const votesByDay = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return { date: date.toISOString().split('T')[0], day: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), votes: 0 };
  }).reverse();
  voteLogs.forEach(v => { const entry = votesByDay.find(d => d.date === v.createdAt.toISOString().split('T')[0]); if (entry) entry.votes++; });

  const aiActivityChartData = includeAiMetrics
    ? Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        return {
          date: dateStr,
          day: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          aiQuestions: 0,
          customerVotes: 0,
          successfulAnswers: 0,
          escalatedToHuman: 0,
        };
      }).reverse()
    : [];

  if (includeAiMetrics) {
    aiLogsActivity.forEach(log => {
      const entry = aiActivityChartData.find(d => d.date === log.createdAt.toISOString().split('T')[0]);
      if (entry) {
        entry.aiQuestions++;
        if (log.vote === 1) entry.customerVotes++;
        if (!log.noAnswer) entry.successfulAnswers++;
        if (log.askedHuman) entry.escalatedToHuman++;
      }
    });
  }

  return json({
    shop,
    stats: { publishedQuestionCount, pendingQuestionCount, totalAnswerCount, unansweredRatio, averageResponseTime },
    activityChartData,
    latestQuestions,
    topProductsByQuestions: topProductsByQuestions.map(p => ({ ...p, title: productMap[p.productId] || p.productId })),
    topProductsByVotes: topProductsByVotes.map(p => ({ ...p, title: productMap[p.productId] || p.productId })),
    topCategories,
    topProductTypes,
    activeAdmins,
    latestUnanswered,
    tagDistribution,
    votesByDay,
    topQuestionsByVotes: topQuestionsByVotesList,
    latestPositiveAi,
    latestUnansweredAi,
    productMap,
    aiActivityChartData,
    showSetupBanner,
    planUpdated,
    updatedPlanName,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "start_setup") {
    // Mark as seen setup
    await prisma.settings.upsert({
      where: { shop: session.shop },
      update: { hasSeenSetup: true },
      create: {
        shop: session.shop,
        data: "{}",
        hasSeenSetup: true,
      },
    });

    return redirect("/app/setup?first_time=true");
  }

  return json({ success: true });
};

export default function DashboardPage() {
  const { shop, stats, activityChartData, latestQuestions, topProductsByQuestions, topProductsByVotes, topCategories, topProductTypes, activeAdmins, latestUnanswered, tagDistribution, votesByDay, topQuestionsByVotes: topQuestionsByVotesList, latestPositiveAi, latestUnansweredAi, productMap, aiActivityChartData, showSetupBanner, planUpdated, updatedPlanName } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [modalContent, setModalContent] = useState(null);

  const handleStartSetup = () => {
    const formData = new FormData();
    formData.append("intent", "start_setup");
    fetcher.submit(formData, { method: "post" });
  };
  const showAdvancedMetrics = usePlanFeature(PlanFeature.DASHBOARD_ENHANCED);
  const showAiMetrics = usePlanFeature(PlanFeature.DASHBOARD_AI_METRICS);

  const tableCellWrapper = (content) => (
    <div style={{ maxWidth: '250px', whiteSpace: 'normal', wordWrap: 'break-word' }}>
      {content}
    </div>
  );

  const openAiModal = (log) => {
    if (!showAiMetrics) return;
    const product = productMap[log.productId];
    setModalContent(
      <Modal.Section>
        <BlockStack gap="400">
          {product && (
              <Card>
                  <BlockStack gap="200">
                      <InlineStack gap="400" blockAlign="center" wrap={false}>
                          <Thumbnail source={product.featuredImage?.url || ""} alt={product.featuredImage?.altText || product.title} size="large" />
                          <Text variant="headingMd">{product.title}</Text>
                      </InlineStack>
                  </BlockStack>
              </Card>
          )}
          <Card>
            <BlockStack gap="200">
              <Text variant="headingSm">Customer Question</Text>
              <Text>{log.customerQuestion}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingSm">AI Answer</Text>
              <Text>{log.aiAnswer}</Text>
            </BlockStack>
          </Card>
          <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3, xl: 3 }} gap="200">
              <Card><BlockStack gap="200" align="center"><Text>Vote</Text><Text variant="headingLg">{log.vote === 1 ? '👍' : log.vote === -1 ? '👎' : '-'}</Text></BlockStack></Card>
              <Card><BlockStack gap="200" align="center"><Text>Asked Human</Text><Text variant="headingLg">{log.askedHuman ? '✅' : '-'}</Text></BlockStack></Card>
              <Card><BlockStack gap="200" align="center"><Text>No Answer</Text><Text variant="headingLg">{log.noAnswer ? '✅' : '-'}</Text></BlockStack></Card>
          </Grid>
        </BlockStack>
      </Modal.Section>
    );
  };

  const latestQuestionsRows = latestQuestions.map(q => [tableCellWrapper(<Link to={`/app/questions/${q.id}`}>{q.question}</Link>), new Date(q.createdAt).toLocaleDateString()]);
  const latestUnansweredRows = latestUnanswered.map(q => [tableCellWrapper(<Link to={`/app/questions/${q.id}`}>{q.question}</Link>), new Date(q.createdAt).toLocaleDateString()]);
  const topProductsByQuestionsRows = topProductsByQuestions.map(p => [tableCellWrapper(<PolarisLink url={`https://${shop}/admin/products/${p.productId}`} target="_blank">{p.title}</PolarisLink>), p._count.productId]);
  const topProductsByVotesRows = topProductsByVotes.map(p => [tableCellWrapper(<PolarisLink url={`https://${shop}/admin/products/${p.productId}`} target="_blank">{p.title}</PolarisLink>), p._sum.votes]);
  const topCategoriesRows = topCategories.map(c => [tableCellWrapper(<Link to={`/app/questions-list?category=${encodeURIComponent(c.productCategory)}`}>{c.productCategory}</Link>), c._count.productCategory]);
  const topProductTypesRows = topProductTypes.map(t => [tableCellWrapper(<Link to={`/app/questions-list?type=${encodeURIComponent(t.productType)}`}>{t.productType}</Link>), t._count.productType]);
  const activeAdminsRows = activeAdmins.map(a => [tableCellWrapper(a.authorEmail), a._count.authorEmail]);
  const topQuestionsByVotesRows = topQuestionsByVotesList.map(q => [tableCellWrapper(<Link to={`/app/questions/${q.id}`}>{q.question}</Link>), q.votes]);
  const latestPositiveAiRows = showAiMetrics ? latestPositiveAi.map(log => [tableCellWrapper(<PolarisLink onClick={() => openAiModal(log)}>{log.customerQuestion}</PolarisLink>), new Date(log.createdAt).toLocaleDateString()]) : [];
  const latestUnansweredAiRows = showAiMetrics ? latestUnansweredAi.map(log => [tableCellWrapper(<PolarisLink onClick={() => openAiModal(log)}>{log.customerQuestion}</PolarisLink>), new Date(log.createdAt).toLocaleDateString()]) : [];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF4560'];

  return (
    <Page title="Dashboard" primaryAction={{ content: "Add Question", onAction: () => navigate("/app/questions/new") }} secondaryActions={[{ content: "View All Questions", onAction: () => navigate("/app/questions-list") }]}>
      {modalContent && <Modal open onClose={() => setModalContent(null)} title="Log Details"><Modal.Section>{modalContent}</Modal.Section></Modal>}
      <Layout>
        {/* Setup Guide Banner - Only show on first time */}
        {showSetupBanner && (
          <Layout.Section>
            <Banner
              title="Welcome! Complete your setup"
              tone="success"
              action={{ content: "Start Setup Guide", onAction: handleStartSetup }}
            >
              <p>
                Get started by installing the Q&A blocks on your product pages. Follow our step-by-step guide to complete the setup in just 5 minutes.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* Plan Updated Banner - Show when plan is auto-synced */}
        {planUpdated && (
          <Layout.Section>
            <Banner
              title="Plan Updated Successfully!"
              tone="success"
              action={{
                content: "Refresh to See New Features",
                onAction: () => window.location.reload(),
              }}
            >
              <p>
                Your subscription has been updated to <strong>{updatedPlanName?.toUpperCase()}</strong>. Click the button to refresh and activate all your new features!
              </p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 2, md: 3, lg: 5, xl: 5 }} gap="400">
            <Card><BlockStack gap="200"><Text as="h2" variant="headingMd">Published</Text><Text as="p" variant="headingXl">{stats.publishedQuestionCount}</Text></BlockStack></Card>
            <Card><BlockStack gap="200"><Text as="h2" variant="headingMd">Pending</Text><Text as="p" variant="headingXl">{stats.pendingQuestionCount}</Text></BlockStack></Card>
            <Card><BlockStack gap="200"><Text as="h2" variant="headingMd">Total Answers</Text><Text as="p" variant="headingXl">{stats.totalAnswerCount}</Text></BlockStack></Card>
            <Card><BlockStack gap="200"><Text as="h2" variant="headingMd">Unanswered</Text><Text as="p" variant="headingXl">{stats.unansweredRatio.toFixed(1)}%</Text></BlockStack></Card>
            <Card><BlockStack gap="200"><Text as="h2" variant="headingMd">Avg. Response Time</Text><Text as="p" variant="headingXl">{formatMilliseconds(stats.averageResponseTime)}</Text></BlockStack></Card>
          </Grid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Activity Overview (Last 30 Days)</Text>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={activityChartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip /><Legend />
                    <Line type="monotone" dataKey="questions" stroke="#007cba" name="Questions" /><Line type="monotone" dataKey="answers" stroke="#10B981" name="Answers" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        {showAiMetrics && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">AI Activity (Last 30 Days)</Text>
                <div style={{ height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={aiActivityChartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="aiQuestions" stroke="#8884d8" name="AI Questions" />
                      <Line type="monotone" dataKey="successfulAnswers" stroke="#82ca9d" name="Successful Answers" />
                      <Line type="monotone" dataKey="customerVotes" stroke="#ffc658" name="Customer Votes" />
                      <Line type="monotone" dataKey="escalatedToHuman" stroke="#ff8042" name="Escalated to Human" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {showAdvancedMetrics && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Votes per Day (Last 30 Days)</Text>
                <div style={{ height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={votesByDay} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip /><Legend />
                      <Line type="monotone" dataKey="votes" stroke="#FF8042" name="Votes" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Tag Distribution</Text>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tagDistribution} layout="vertical" margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" hide /><YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} /><Tooltip cursor={{ fill: '#f5f5f5' }} />
                    <Bar dataKey="count" name="Questions">{tagDistribution.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        {showAiMetrics && (
          <Layout.Section>
            <Grid columns={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2 }} gap="400">
              <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Latest Positively Voted AI Questions</Text><DataTable columnContentTypes={['text', 'text']} headings={['Question', 'Date']} rows={latestPositiveAiRows} /></BlockStack></Card>
              <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Latest Unanswered AI Questions</Text><DataTable columnContentTypes={['text', 'text']} headings={['Question', 'Date']} rows={latestUnansweredAiRows} /></BlockStack></Card>
            </Grid>
          </Layout.Section>
        )}

        {showAdvancedMetrics && (
          <Layout.Section>
            <Grid columns={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2 }} gap="400">
              <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Latest Unanswered Questions</Text><DataTable columnContentTypes={['text', 'text']} headings={['Question', 'Date']} rows={latestUnansweredRows} /></BlockStack></Card>
              <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Most Active Admins</Text><DataTable columnContentTypes={['text', 'numeric']} headings={['Admin Email', 'Answers']} rows={activeAdminsRows} /></BlockStack></Card>
              <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Top Questions by Votes</Text><DataTable columnContentTypes={['text', 'numeric']} headings={['Question', 'Votes']} rows={topQuestionsByVotesRows} /></BlockStack></Card>
              <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Top Products by Questions</Text><DataTable columnContentTypes={['text', 'numeric']} headings={['Product', 'Questions']} rows={topProductsByQuestionsRows} /></BlockStack></Card>
              <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Top Products by Votes</Text><DataTable columnContentTypes={['text', 'numeric']} headings={['Product', 'Votes']} rows={topProductsByVotesRows} /></BlockStack></Card>
              <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Top Categories</Text><DataTable columnContentTypes={['text', 'numeric']} headings={['Category', 'Count']} rows={topCategoriesRows} /></BlockStack></Card>
              <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Top Product Types</Text><DataTable columnContentTypes={['text', 'numeric']} headings={['Product Type', 'Count']} rows={topProductTypesRows} /></BlockStack></Card>
            </Grid>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
