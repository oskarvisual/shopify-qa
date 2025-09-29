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
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

// Loader for the new dashboard
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // --- Existing Stats & Charts ---
  const publishedQuestionCount = await prisma.question.count({ where: { shop, isPublished: true } });
  const pendingQuestionCount = await prisma.question.count({ where: { shop, isPublished: false } });
  const totalAnswerCount = await prisma.answer.count({ where: { question: { shop } } });

  const recentQuestionsActivity = await prisma.question.findMany({ where: { shop, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } });
  const recentAnswersActivity = await prisma.answer.findMany({ where: { question: { shop }, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } });

  const activityChartData = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    return { date: dateStr, day: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), questions: 0, answers: 0 };
  }).reverse();
  recentQuestionsActivity.forEach(q => { const entry = activityChartData.find(d => d.date === q.createdAt.toISOString().split('T')[0]); if (entry) entry.questions++; });
  recentAnswersActivity.forEach(a => { const entry = activityChartData.find(d => d.date === a.createdAt.toISOString().split('T')[0]); if (entry) entry.answers++; });

  const latestQuestions = await prisma.question.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, question: true, createdAt: true } });
  const topProductsByQuestions = await prisma.question.groupBy({ by: ["productId"], where: { shop }, _count: { productId: true }, orderBy: { _count: { productId: "desc" } }, take: 5 });
  const topProductsByVotes = await prisma.question.groupBy({ by: ["productId"], where: { shop }, _sum: { votes: true }, orderBy: { _sum: { votes: "desc" } }, take: 5 });
  const topCategories = await prisma.question.groupBy({ by: ["productCategory"], where: { shop, productCategory: { not: null } }, _count: { productCategory: true }, orderBy: { _count: { productCategory: "desc" } }, take: 5 });
  const topProductTypes = await prisma.question.groupBy({ by: ["productType"], where: { shop, productType: { not: null } }, _count: { productType: true }, orderBy: { _count: { productType: "desc" } }, take: 5 });

  const productIds = [...new Set([...topProductsByQuestions.map(p => p.productId), ...topProductsByVotes.map(p => p.productId)])];
  const productMap = {};
  if (productIds.length > 0) {
    const gqlProductIds = productIds.map(id => `gid://shopify/Product/${id}`);
    const productResponse = await admin.graphql(`query getProducts($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id title } } }`, { variables: { ids: gqlProductIds } });
    const { data } = await productResponse.json();
    data.nodes?.forEach(product => { if (product) { const numericId = product.id.replace('gid://shopify/Product/', ''); productMap[numericId] = product.title; } });
  }

  // --- New Analytics ---
  const totalQuestions = await prisma.question.count({ where: { shop } });
  const unansweredQuestionsCount = await prisma.question.count({ where: { shop, answers: { none: {} } } });
  const unansweredRatio = totalQuestions > 0 ? (unansweredQuestionsCount / totalQuestions) * 100 : 0;

  const answeredQuestions = await prisma.question.findMany({ where: { shop, answers: { some: {} } }, include: { answers: { orderBy: { createdAt: 'asc' }, take: 1 } } });
  let totalResponseTime = 0;
  answeredQuestions.forEach(q => { totalResponseTime += new Date(q.answers[0].createdAt).getTime() - new Date(q.createdAt).getTime(); });
  const averageResponseTime = answeredQuestions.length > 0 ? totalResponseTime / answeredQuestions.length : 0;

  const activeAdmins = await prisma.answer.groupBy({ by: ['authorEmail'], where: { question: { shop: shop }, authorEmail: { not: null } }, _count: { authorEmail: true }, orderBy: { _count: { authorEmail: 'desc' } }, take: 5 });
  const latestUnanswered = await prisma.question.findMany({ where: { shop, answers: { none: {} } }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, question: true, createdAt: true } });

  const allQuestionsWithTags = await prisma.question.findMany({
    where: {
      shop,
      AND: [
        { productTags: { not: null } },
        { productTags: { not: '' } }
      ]
    },
    select: { productTags: true }
  });
  const tagCounts = {};
  allQuestionsWithTags.forEach(q => {
    const tags = q.productTags.split(',').map(t => t.trim());
    tags.forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
  });
  const tagDistribution = Object.entries(tagCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  const voteLogs = await prisma.voteLog.findMany({ where: { shop, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } });
  const votesByDay = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return { date: date.toISOString().split('T')[0], day: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), votes: 0 };
  }).reverse();
  voteLogs.forEach(v => { const entry = votesByDay.find(d => d.date === v.createdAt.toISOString().split('T')[0]); if (entry) entry.votes++; });

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
  });
};

// The New Dashboard Component
export default function DashboardPage() {
  const { shop, stats, activityChartData, latestQuestions, topProductsByQuestions, topProductsByVotes, topCategories, topProductTypes, activeAdmins, latestUnanswered, tagDistribution, votesByDay } = useLoaderData();
  const navigate = useNavigate();

  const tableCellWrapper = (content) => (
    <div style={{ maxWidth: '250px', whiteSpace: 'normal', wordWrap: 'break-word' }}>
      {content}
    </div>
  );

  const latestQuestionsRows = latestQuestions.map(q => [tableCellWrapper(<Link to={`/app/questions/${q.id}`}>{q.question}</Link>), new Date(q.createdAt).toLocaleDateString()]);
  const latestUnansweredRows = latestUnanswered.map(q => [tableCellWrapper(<Link to={`/app/questions/${q.id}`}>{q.question}</Link>), new Date(q.createdAt).toLocaleDateString()]);
  const topProductsByQuestionsRows = topProductsByQuestions.map(p => [tableCellWrapper(<PolarisLink url={`https://${shop}/admin/products/${p.productId}`} target="_blank">{p.title}</PolarisLink>), p._count.productId]);
  const topProductsByVotesRows = topProductsByVotes.map(p => [tableCellWrapper(<PolarisLink url={`https://${shop}/admin/products/${p.productId}`} target="_blank">{p.title}</PolarisLink>), p._sum.votes]);
  const topCategoriesRows = topCategories.map(c => [tableCellWrapper(<Link to={`/app/questions-list?category=${encodeURIComponent(c.productCategory)}`}>{c.productCategory}</Link>), c._count.productCategory]);
  const topProductTypesRows = topProductTypes.map(t => [tableCellWrapper(<Link to={`/app/questions-list?type=${encodeURIComponent(t.productType)}`}>{t.productType}</Link>), t._count.productType]);
  const activeAdminsRows = activeAdmins.map(a => [tableCellWrapper(a.authorEmail), a._count.authorEmail]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF4560'];

  return (
    <Page title="Dashboard" primaryAction={{ content: "Add Question", onAction: () => navigate("/app/questions/new") }} secondaryActions={[{ content: "View All Questions", onAction: () => navigate("/app/questions-list") }]}>
      <Layout>
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
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="questions" stroke="#007cba" name="Questions" />
                    <Line type="monotone" dataKey="answers" stroke="#10B981" name="Answers" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Votes per Day (Last 30 Days)</Text>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={votesByDay} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="votes" stroke="#FF8042" name="Votes" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Tag Distribution</Text>
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tagDistribution} layout="vertical" margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                    <Tooltip cursor={{ fill: '#f5f5f5' }} />
                    <Bar dataKey="count" name="Questions">
                      {tagDistribution.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Grid columns={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2 }} gap="400">
            <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Latest Unanswered Questions</Text><DataTable columnContentTypes={['text', 'text']} headings={['Question', 'Date']} rows={latestUnansweredRows} /></BlockStack></Card>
            <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Most Active Admins</Text><DataTable columnContentTypes={['text', 'numeric']} headings={['Admin Email', 'Answers']} rows={activeAdminsRows} /></BlockStack></Card>
            <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Top Products by Questions</Text><DataTable columnContentTypes={['text', 'numeric']} headings={['Product', 'Questions']} rows={topProductsByQuestionsRows} /></BlockStack></Card>
            <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Top Products by Votes</Text><DataTable columnContentTypes={['text', 'numeric']} headings={['Product', 'Votes']} rows={topProductsByVotesRows} /></BlockStack></Card>
            <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Top Categories</Text><DataTable columnContentTypes={['text', 'numeric']} headings={['Category', 'Count']} rows={topCategoriesRows} /></BlockStack></Card>
            <Card><BlockStack gap="400"><Text as="h2" variant="headingMd">Top Product Types</Text><DataTable columnContentTypes={['text', 'numeric']} headings={['Product Type', 'Count']}
                  rows={topProductTypesRows} /></BlockStack></Card>
          </Grid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
