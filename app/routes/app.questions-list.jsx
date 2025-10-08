import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, Form, Link } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  IndexTable,
  Pagination,
  TextField,
  Button,
  InlineStack,
  Select,
  Link as PolarisLink,
  Text,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { triggerWebhook } from "../lib/webhook.server.js";
import { sendQuestionPublishedNotification } from "../lib/email.server.js";
import prisma from "../db.server";
const PAGE_SIZE = 10;

const GET_PRODUCT_HANDLE_AND_SHOP_QUERY = `
  query getProductHandleAndShop($productId: ID!) {
    product(id: $productId) {
      handle
    }
    shop {
      name
    }
  }
`;

// Action to handle mutations like approving a question
export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const { shop } = session;
  const formData = await request.formData();

  const actionType = formData.get("_action");
  const questionId = formData.get("questionId");

  if (actionType === "approve" && questionId) {
    try {
      const existingQuestion = await prisma.question.findUnique({
        where: { id: questionId },
      });

      if (!existingQuestion || existingQuestion.shop !== shop) {
        return json({ success: false, error: "Question not found." }, { status: 404 });
      }

      const question = await prisma.question.update({
        where: { id: questionId, shop },
        data: { isPublished: true },
        include: { answers: true },
      });

      if (!existingQuestion.isPublished && question.isPublished) {
        let productHandle;
        let storeName;

        if (question.productId) {
          try {
            const productResponse = await admin.graphql(GET_PRODUCT_HANDLE_AND_SHOP_QUERY, {
              variables: { productId: `gid://shopify/Product/${question.productId}` },
            });
            const productData = await productResponse.json();
            productHandle = productData.data?.product?.handle;
            storeName = productData.data?.shop?.name;
          } catch (productError) {
            console.error("Failed to fetch product details for approval email:", productError);
          }
        }

        await sendQuestionPublishedNotification(shop, question, {
          productHandle,
          storeName,
        });
      }

      // Trigger webhook
      await triggerWebhook(shop, "approveQuestion", {
        action: "approve",
        entity: "question",
        shop,
        data: question
      });

      return json({ success: true });
    } catch (error) {
      console.error("Failed to approve question from list:", error);
      return json({ success: false, error: "Failed to approve question." }, { status: 500 });
    }
  }

  return json({ success: false, error: "Invalid action." }, { status: 400 });
};

// Loader to fetch paginated and searchable/filterable questions
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const query = url.searchParams.get("query") || "";
  const status = url.searchParams.get("status") || "all";
  const category = url.searchParams.get("category");
  const type = url.searchParams.get("type");

  const whereClause = {
    shop,
    ...(query && { OR: [{ customerName: { contains: query } }, { customerEmail: { contains: query } }, { question: { contains: query } }, { answers: { some: { answer: { contains: query } } } }] }),
    ...(status !== "all" && { isPublished: status === "published" }),
    ...(category && { productCategory: category }),
    ...(type && { productType: type }),
  };

  const questions = await prisma.question.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
    include: { answers: true },
  });

  const totalQuestionsFiltered = await prisma.question.count({ where: whereClause });
  const pageCount = Math.ceil(totalQuestionsFiltered / PAGE_SIZE);

  const productIds = [...new Set(questions.map((q) => q.productId))];
  const productMap = {};

  if (productIds.length > 0) {
    try {
      const productQuery = `query getProducts($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id title handle status } } }`;
      const gqlProductIds = productIds.map((id) => `gid://shopify/Product/${id}`);
      const productResponse = await admin.graphql(productQuery, { variables: { ids: gqlProductIds } });
      const { data } = await productResponse.json();
      if (data?.nodes) {
        data.nodes.forEach((product) => {
          if (product) {
            const numericId = product.id.replace("gid://shopify/Product/", "");
            productMap[numericId] = product;
          }
        });
      }
    } catch (error) {
      console.error("Error fetching product data:", error);
    }
  }

  return json({
    questions,
    pageInfo: { currentPage: page, pageCount, hasNext: page < pageCount, hasPrevious: page > 1 },
    query,
    status,
    category,
    type,
    shop,
    productMap,
  });
};

// The Questions List Component
export default function QuestionsListPage() {
  const { questions, pageInfo, query, status, category, type, shop, productMap } = useLoaderData();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState(query);
  const [statusFilter, setStatusFilter] = useState(status);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentQuery = params.get('query') || '';
    const currentStatus = params.get('status') || 'all';

    if (searchQuery !== currentQuery || statusFilter !== currentStatus) {
      const timeoutId = setTimeout(() => {
        params.set('page', '1');
        if (searchQuery.trim()) {
          params.set("query", searchQuery.trim());
        } else {
          params.delete("query");
        }
        if (statusFilter !== "all") {
          params.set("status", statusFilter);
        } else {
          params.delete("status");
        }
        navigate(`/app/questions-list?${params.toString()}`, { replace: true });
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, statusFilter, navigate]);

  const resourceName = { singular: "question", plural: "questions" };
  const statusOptions = [{ label: "All", value: "all" }, { label: "Published", value: "published" }, { label: "Pending", value: "pending" }];

  const rowMarkup = questions.map(({ id, question, customerName, customerEmail, isPublished, createdAt, answers, productId }, index) => (
    <IndexTable.Row id={id} key={id} position={index}>
      <IndexTable.Cell>
        <div style={{ maxWidth: '400px', whiteSpace: 'normal', wordWrap: 'break-word' }}>
          <BlockStack gap="300">
            <Link to={`/app/questions/${id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Text variant="bodyMd" as="p">{question}</Text>
            </Link>
            <InlineStack gap="200">
              <Button variant="primary" size="slim" onClick={() => navigate(`/app/questions/${id}`)}>Edit</Button>
              <Button size="slim" onClick={() => navigate(`/app/questions/${id}#answer-form`)}>Add Answer</Button>
              {!isPublished && (
                <Form method="post" style={{ display: 'inline-block' }}>
                  <input type="hidden" name="_action" value="approve" />
                  <input type="hidden" name="questionId" value={id} />
                  <Button submit size="slim" variant="secondary">Approve</Button>
                </Form>
              )}
            </InlineStack>
          </BlockStack>
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>{answers.length}</IndexTable.Cell>
      <IndexTable.Cell><Text tone={isPublished ? "success" : "subdued"}>{isPublished ? "Published" : "Pending"}</Text></IndexTable.Cell>
      <IndexTable.Cell><BlockStack gap="100"><Text variant="bodyMd" fontWeight="semibold">{customerName || "Anonymous"}</Text>{customerEmail && <Text variant="bodySm" tone="subdued">{customerEmail}</Text>}</BlockStack></IndexTable.Cell>
      <IndexTable.Cell>
        {productMap[productId] ? (
          <BlockStack gap="200">
            <Text variant="bodyMd" fontWeight="semibold">{productMap[productId].title}</Text>
            <InlineStack gap="200" blockAlign="center">
              <Button size="slim" url={`https://${shop}/products/${productMap[productId].handle}`} target="_blank">View</Button>
              <Button size="slim" url={`https://${shop}/admin/products/${productId}`} target="_blank">Edit</Button>
            </InlineStack>
          </BlockStack>
        ) : (
          "Product not found"
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>{new Date(createdAt).toLocaleDateString()}</IndexTable.Cell>
    </IndexTable.Row>
  ));

  const activeFilter = category ? { type: 'Category', value: category } : type ? { type: 'Product Type', value: type } : null;

  const pageTitle = activeFilter ? `Questions for ${activeFilter.type}: "${activeFilter.value}"` : "Questions & Answers";

  return (
    <Page
      title={pageTitle}
      primaryAction={{ content: "Add question", onAction: () => navigate("/app/questions/new") }}
      secondaryActions={[{ content: "Import/Export", onAction: () => navigate("/app/import-export") }]}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <InlineStack gap="400" align="space-between" blockAlign="center">
                <div style={{ flexGrow: 1 }}>
                  <TextField placeholder="Search questions by content, author..." value={searchQuery} onChange={setSearchQuery} onClearButtonClick={() => setSearchQuery("")} autoComplete="off" clearButton />
                </div>
                <div style={{ minWidth: "120px" }}>
                  <Select options={statusOptions} onChange={setStatusFilter} value={statusFilter} />
                </div>
                {activeFilter && (
                  <Button onClick={() => navigate("/app/questions-list")} plain>Clear filter</Button>
                )}
              </InlineStack>

              {activeFilter && (
                <Badge tone="info">Filtering by {activeFilter.type}: {activeFilter.value}</Badge>
              )}

              <IndexTable resourceName={resourceName} itemCount={questions.length} headings={[{ title: "Question" }, { title: "Answers" }, { title: "Status" }, { title: "Author" }, { title: "Product" }, { title: "Date" }]} selectable={false} stickyFirstColumn={true}>
                {rowMarkup}
              </IndexTable>

              <InlineStack align="center">
                <Pagination
                  hasPrevious={pageInfo.hasPrevious}
                  onPrevious={() => {
                    const params = new URLSearchParams(window.location.search);
                    params.set("page", (pageInfo.currentPage - 1).toString());
                    navigate(`/app/questions-list?${params.toString()}`);
                  }}
                  hasNext={pageInfo.hasNext}
                  onNext={() => {
                    const params = new URLSearchParams(window.location.search);
                    params.set("page", (pageInfo.currentPage + 1).toString());
                    navigate(`/app/questions-list?${params.toString()}`);
                  }}
                />
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
