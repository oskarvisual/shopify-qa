
import { json } from "@remix-run/node";
import { useLoaderData, Form, useSubmit, useNavigate, Link } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  IndexTable,
  Pagination,
  TextField,
  Button,
  InlineStack,
  Grid,
  Select,
} from "@shopify/polaris";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PAGE_SIZE = 10;

// Loader to fetch paginated and searchable questions, plus statistics
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const query = url.searchParams.get("query") || "";
  const status = url.searchParams.get("status") || "all";

  const whereClause = {
    shop,
    ...(query && {
      OR: [
        { customerName: { contains: query } },
        { customerEmail: { contains: query } },
        { question: { contains: query } },
        { answers: { some: { answer: { contains: query } } } },
      ],
    }),
    ...(status !== "all" && {
      isPublished: status === "published"
    }),
  };

  // Fetch questions for the table
  const questions = await prisma.question.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
    include: { answers: true }, // Include answers for search and display
  });

  const totalQuestionsFiltered = await prisma.question.count({ where: whereClause });
  const pageCount = Math.ceil(totalQuestionsFiltered / PAGE_SIZE);

  // Fetch statistics
  const publishedQuestionCount = await prisma.question.count({
    where: { shop, isPublished: true },
  });
  const pendingQuestionCount = await prisma.question.count({
    where: { shop, isPublished: false },
  });
  const totalAnswerCount = await prisma.answer.count({
    where: { question: { shop } },
  });

  // Get activity data for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get questions for last 30 days
  const recentQuestions = await prisma.question.findMany({
    where: {
      shop: shop,
      createdAt: { gte: thirtyDaysAgo }
    },
    select: {
      createdAt: true
    }
  });

  // Get answers for last 30 days (only for this shop's questions)
  const recentAnswers = await prisma.answer.findMany({
    where: {
      question: { shop: shop },
      createdAt: { gte: thirtyDaysAgo }
    },
    select: {
      createdAt: true
    }
  });

  // Generate last 30 days array with activity counts
  const chartData = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    // Count questions for this day
    const questionsCount = recentQuestions.filter(q =>
      q.createdAt.toISOString().split('T')[0] === dateStr
    ).length;

    // Count answers for this day
    const answersCount = recentAnswers.filter(a =>
      a.createdAt.toISOString().split('T')[0] === dateStr
    ).length;

    chartData.push({
      date: dateStr,
      day: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      questions: questionsCount,
      answers: answersCount,
    });
  }

  // Get unique product IDs from questions and fetch product info
  const productIds = [...new Set(questions.map(q => q.productId))];
  const productMap = {};

  if (productIds.length > 0) {
    try {
      const productQuery = `
        query getProducts($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              handle
              status
            }
          }
        }
      `;

      const gqlProductIds = productIds.map(id => `gid://shopify/Product/${id}`);
      const productResponse = await admin.graphql(productQuery, {
        variables: { ids: gqlProductIds }
      });

      const { data } = await productResponse.json();
      if (data?.nodes) {
        data.nodes.forEach(product => {
          if (product) {
            const numericId = product.id.replace('gid://shopify/Product/', '');
            productMap[numericId] = product;
          }
        });
      }
    } catch (error) {
      console.error('Error fetching product data:', error);
    }
  }

  return json({
    questions,
    pageInfo: {
      currentPage: page,
      pageCount,
      hasNext: page < pageCount,
      hasPrevious: page > 1,
    },
    query,
    status,
    publishedQuestionCount,
    pendingQuestionCount,
    totalAnswerCount,
    productMap,
    shop,
    chartData,
  });
};

// The Dashboard Component (now showing questions table and stats)
export default function DashboardPage() {
  const { questions, pageInfo, query, status, publishedQuestionCount, pendingQuestionCount, totalAnswerCount, productMap, shop, chartData } = useLoaderData();
  const submit = useSubmit();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState(query);
  const [statusFilter, setStatusFilter] = useState(status);

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery !== query || statusFilter !== status) {
        const params = new URLSearchParams();
        if (searchQuery.trim()) {
          params.set("query", searchQuery.trim());
        }
        if (statusFilter !== "all") {
          params.set("status", statusFilter);
        }
        navigate(`/app?${params.toString()}`, { replace: true });
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, query, statusFilter, status, navigate]);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) {
      params.set("query", searchQuery.trim());
    }
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    navigate(`/app?${params.toString()}`);
  };

  const resourceName = {
    singular: "question",
    plural: "questions",
  };

  const statusOptions = [
    { label: "All", value: "all" },
    { label: "Published", value: "published" },
    { label: "Pending", value: "pending" },
  ];

  const rowMarkup = questions.map(
    ({ id, question, customerName, customerEmail, isPublished, createdAt, answers, productId }, index) => {
      const product = productMap[productId];
      const isPending = !isPublished;
      const rowStyle = isPending ? { opacity: 0.6 } : {};

      return (
        <IndexTable.Row id={id} key={id} position={index} style={rowStyle}>
          <IndexTable.Cell>
            <div style={{ maxWidth: '300px', wordWrap: 'break-word', whiteSpace: 'normal' }}>
              {question}
            </div>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <div>
              <div style={{ fontWeight: '500' }}>{customerName || "Anonymous"}</div>
              {customerEmail && (
                <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                  {customerEmail}
                </div>
              )}
            </div>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {product ? (
              <Button
                plain
                onClick={() => window.open(`https://${shop}/products/${product.handle}`, '_blank')}
                accessibilityLabel={`View product: ${product.title}`}
              >
                <span title={product.title}>View Product</span>
              </Button>
            ) : (
              "Product not found"
            )}
          </IndexTable.Cell>
          <IndexTable.Cell>{new Date(createdAt).toLocaleDateString()}</IndexTable.Cell>
          <IndexTable.Cell>{answers.length}</IndexTable.Cell>
          <IndexTable.Cell>
            <span style={{
              opacity: isPending ? 0.7 : 1,
              color: isPending ? '#9CA3AF' : (isPublished ? '#10B981' : '#6B7280')
            }}>
              {isPublished ? "Published" : "Pending"}
            </span>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Button
              variant="primary"
              size="slim"
              onClick={() => navigate(`/app/questions/${id}`)}
            >
              View
            </Button>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    },
  );

  return (
    <Page title="Questions Dashboard">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* 30-Day Activity Chart */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Activity Overview (Last 30 Days)
                </Text>
                <div style={{ height: '300px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{
                        top: 20,
                        right: 30,
                        left: 20,
                        bottom: 20,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 12 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        labelFormatter={(label, payload) => {
                          if (payload && payload[0]) {
                            const data = payload[0].payload;
                            return `${data.date}`;
                          }
                          return label;
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="questions"
                        stroke="#007cba"
                        strokeWidth={2}
                        name="Questions"
                        dot={{ fill: '#007cba', strokeWidth: 2, r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="answers"
                        stroke="#10B981"
                        strokeWidth={2}
                        name="Answers"
                        dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </BlockStack>
            </Card>

            {/* Stat Cards */}
            <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3, xl: 3 }} gap="400">
              <Card roundedAbove="sm">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Published Questions
                  </Text>
                  <Text as="p" variant="headingXl">
                    {publishedQuestionCount}
                  </Text>
                </BlockStack>
              </Card>
              <Card roundedAbove="sm">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Pending Questions
                  </Text>
                  <Text as="p" variant="headingXl">
                    {pendingQuestionCount}
                  </Text>
                </BlockStack>
              </Card>
              <Card roundedAbove="sm">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Total Answers
                  </Text>
                  <Text as="p" variant="headingXl">
                    {totalAnswerCount}
                  </Text>
                </BlockStack>
              </Card>
            </Grid>

            {/* Questions Table Section */}
            <Card>
              <BlockStack gap="500">
                {/* Toolbar */}
                <InlineStack gap="400" align="space-between" blockAlign="center">
                  <div style={{ flexGrow: 1 }}>
                    <TextField
                      placeholder="Search questions in real-time..."
                      value={searchQuery}
                      onChange={setSearchQuery}
                      onClearButtonClick={() => {
                        setSearchQuery("");
                      }}
                      autoComplete="off"
                      clearButton
                    />
                  </div>
                  <div style={{ minWidth: '120px' }}>
                    <Select
                      options={statusOptions}
                      onChange={setStatusFilter}
                      value={statusFilter}
                      placeholder="Filter by status"
                    />
                  </div>
                  <InlineStack gap="200">
                    <Button onClick={() => navigate("/app/import-export")}>Import/Export</Button>
                    <Button variant="primary" onClick={() => navigate("/app/questions/new")}>Add question</Button>
                  </InlineStack>
                </InlineStack>

                {/* Table */}
                <IndexTable
                  resourceName={resourceName}
                  itemCount={questions.length}
                  headings={[
                    { title: "Question" },
                    { title: "Author" },
                    { title: "Product" },
                    { title: "Date" },
                    { title: "Answers" },
                    { title: "Status" },
                    { title: "Actions" },
                  ]}
                  selectable={false}
                >
                  {rowMarkup}
                </IndexTable>

                {/* Pagination */}
                <InlineStack align="center">
                  <Pagination
                    hasPrevious={pageInfo.hasPrevious}
                    onPrevious={() => {
                      const prevPage = pageInfo.currentPage - 1;
                      const params = new URLSearchParams();
                      params.set("page", prevPage.toString());
                      if (query) params.set("query", query);
                      if (status !== "all") params.set("status", status);
                      navigate(`/app?${params.toString()}`);
                    }}
                    hasNext={pageInfo.hasNext}
                    onNext={() => {
                      const nextPage = pageInfo.currentPage + 1;
                      const params = new URLSearchParams();
                      params.set("page", nextPage.toString());
                      if (query) params.set("query", query);
                      if (status !== "all") params.set("status", status);
                      navigate(`/app?${params.toString()}`);
                    }}
                  />
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
