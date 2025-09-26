import { json } from "@remix-run/node";
import { useLoaderData, Link, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Grid,
  DataTable,
  Link as PolarisLink,
} from "@shopify/polaris";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Loader for the new dashboard
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;

  // 1. General Statistics
  const publishedQuestionCount = await prisma.question.count({ where: { shop, isPublished: true } });
  const pendingQuestionCount = await prisma.question.count({ where: { shop, isPublished: false } });
  const totalAnswerCount = await prisma.answer.count({ where: { question: { shop } } });

  // 2. Activity Chart Data
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentQuestionsActivity = await prisma.question.findMany({ where: { shop, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } });
  const recentAnswersActivity = await prisma.answer.findMany({ where: { question: { shop }, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } });

  const chartData = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    return { date: dateStr, day: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), questions: 0, answers: 0 };
  }).reverse();

  recentQuestionsActivity.forEach(q => {
    const dateStr = q.createdAt.toISOString().split('T')[0];
    const entry = chartData.find(d => d.date === dateStr);
    if (entry) entry.questions++;
  });

  recentAnswersActivity.forEach(a => {
    const dateStr = a.createdAt.toISOString().split('T')[0];
    const entry = chartData.find(d => d.date === dateStr);
    if (entry) entry.answers++;
  });

  // 3. Dashboard Panels Data
  const latestQuestions = await prisma.question.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, question: true, createdAt: true } });
  const topProductsByQuestions = await prisma.question.groupBy({ by: ["productId"], where: { shop }, _count: { productId: true }, orderBy: { _count: { productId: "desc" } }, take: 5 });
  const topProductsByVotes = await prisma.question.groupBy({ by: ["productId"], where: { shop }, _sum: { votes: true }, orderBy: { _sum: { votes: "desc" } }, take: 5 });
  const topCategories = await prisma.question.groupBy({ by: ["productCategory"], where: { shop, productCategory: { not: null } }, _count: { productCategory: true }, orderBy: { _count: { productCategory: "desc" } }, take: 5 });
  const topProductTypes = await prisma.question.groupBy({ by: ["productType"], where: { shop, productType: { not: null } }, _count: { productType: true }, orderBy: { _count: { productType: "desc" } }, take: 5 });

  const productIds = [...new Set([...topProductsByQuestions.map(p => p.productId), ...topProductsByVotes.map(p => p.productId)])];
  const productMap = {};
  if (productIds.length > 0) {
    const gqlProductIds = productIds.map(id => `gid://shopify/Product/${id}`);
    const productResponse = await admin.graphql(
      `query getProducts($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id title } } }`,
      { variables: { ids: gqlProductIds } }
    );
    const { data } = await productResponse.json();
    data.nodes?.forEach(product => {
      if (product) {
        const numericId = product.id.replace('gid://shopify/Product/', '');
        productMap[numericId] = product.title;
      }
    });
  }

  return json({
    shop,
    stats: { publishedQuestionCount, pendingQuestionCount, totalAnswerCount },
    chartData,
    latestQuestions,
    topProductsByQuestions: topProductsByQuestions.map(p => ({ ...p, title: productMap[p.productId] || p.productId })),
    topProductsByVotes: topProductsByVotes.map(p => ({ ...p, title: productMap[p.productId] || p.productId })),
    topCategories,
    topProductTypes,
  });
};

// The New Dashboard Component
export default function DashboardPage() {
  const { shop, stats, chartData, latestQuestions, topProductsByQuestions, topProductsByVotes, topCategories, topProductTypes } = useLoaderData();
  const navigate = useNavigate();

  const latestQuestionsRows = latestQuestions.map(q => [
    <Link to={`/app/questions/${q.id}`}><Text variant="bodyMd" as="p">{q.question.substring(0, 60)}{q.question.length > 60 ? '...' : ''}</Text></Link>,
    new Date(q.createdAt).toLocaleDateString(),
  ]);

  const topProductsByQuestionsRows = topProductsByQuestions.map(p => [
    <PolarisLink url={`https://${shop}/admin/products/${p.productId}`} target="_blank">{p.title}</PolarisLink>,
    p._count.productId
  ]);

  const topProductsByVotesRows = topProductsByVotes.map(p => [
    <PolarisLink url={`https://${shop}/admin/products/${p.productId}`} target="_blank">{p.title}</PolarisLink>,
    p._sum.votes
  ]);

  const topCategoriesRows = topCategories.map(c => [
    <Link to={`/app/questions-list?category=${encodeURIComponent(c.productCategory)}`}>
      {c.productCategory}
    </Link>,
    c._count.productCategory
  ]);

  const topProductTypesRows = topProductTypes.map(t => [
    <Link to={`/app/questions-list?type=${encodeURIComponent(t.productType)}`}>{t.productType}</Link>,
    t._count.productType
  ]);

  return (
    <Page
      title="Dashboard"
      primaryAction={{ content: "Add Question", onAction: () => navigate("/app/questions/new") }}
      secondaryActions={[{ content: "View All Questions", onAction: () => navigate("/app/questions-list") }]}
    >
      <Layout>
        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 2, md: 3, lg: 3, xl: 3 }} gap="400">
            <Card roundedAbove="sm">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Published Questions</Text>
                <Text as="p" variant="headingXl">{stats.publishedQuestionCount}</Text>
              </BlockStack>
            </Card>
            <Card roundedAbove="sm">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Pending Questions</Text>
                <Text as="p" variant="headingXl">{stats.pendingQuestionCount}</Text>
              </BlockStack>
            </Card>
            <Card roundedAbove="sm">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Total Answers</Text>
                <Text as="p" variant="headingXl">{stats.totalAnswerCount}</Text>
              </BlockStack>
            </Card>
          </Grid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Activity Overview (Last 30 Days)</Text>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="questions" stroke="#007cba" strokeWidth={2} name="Questions" />
                    <Line type="monotone" dataKey="answers" stroke="#10B981" strokeWidth={2} name="Answers" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2 }} gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Latest Questions</Text>
                <DataTable
                  columnContentTypes={['text', 'text']}
                  headings={['Question', 'Date']}
                  rows={latestQuestionsRows}
                />
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Top Products by Questions</Text>
                <DataTable
                  columnContentTypes={['text', 'numeric']}
                  headings={['Product', 'Questions']}
                  rows={topProductsByQuestionsRows}
                />
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Top Products by Votes</Text>
                <DataTable
                  columnContentTypes={['text', 'numeric']}
                  headings={['Product', 'Votes']}
                  rows={topProductsByVotesRows}
                />
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="500">
                <div>
                  <Text as="h2" variant="headingMd">Top Categories</Text>
                  <DataTable
                    columnContentTypes={['text', 'numeric']}
                    headings={['Category', 'Count']}
                    rows={topCategoriesRows}
                  />
                </div>
                <div>
                  <Text as="h2" variant="headingMd">Top Product Types</Text>
                  <DataTable
                    columnContentTypes={['text', 'numeric']}
                    headings={['Product Type', 'Count']}
                    rows={topProductTypesRows}
                  />
                </div>
              </BlockStack>
            </Card>
          </Grid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}