import { json, redirect } from "@remix-run/node";
import { useActionData, useSubmit, useNavigate, useOutletContext } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Button,
  InlineStack,
  Select,
  Thumbnail,
  Badge,
  Link as PolarisLink,
} from "@shopify/polaris";
import { ExternalIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Action to handle creating a new question
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const formData = await request.formData();
  const questionText = formData.get("questionText");
  const productId = formData.get("productId");
  const customerName = formData.get("customerName");
  const customerEmail = formData.get("customerEmail");
  const isPublished = formData.get("isPublished") === "true";

  if (!questionText || !productId || productId === "") {
    return json({ error: "Question text and product are required" }, { status: 400 });
  }

  try {
    const newQuestion = await prisma.question.create({
      data: {
        shop: shop,
        productId: productId,
        question: questionText,
        customerName: customerName,
        customerEmail: customerEmail,
        isPublished: isPublished,
      },
    });
    return redirect(`/app/questions/${newQuestion.id}`);
  } catch (error) {
    console.error("Error creating question:", error);
    return json({ error: "Failed to create question" }, { status: 500 });
  }
};

// The New Question Page Component
export default function NewQuestionPage() {
  const actionData = useActionData();
  const submit = useSubmit();
  const navigate = useNavigate();
  const { products, shop } = useOutletContext();

  // Form state
  const [questionText, setQuestionText] = useState("");
  const [productId, setProductId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  const handleSubmit = () => {
    if (!questionText.trim()) {
      alert("Please enter a question");
      return;
    }
    if (!productId || productId === "") {
      alert("Please select a product");
      return;
    }

    const formData = new FormData();
    formData.append("questionText", questionText);
    formData.append("productId", productId);
    formData.append("customerName", customerName);
    formData.append("customerEmail", customerEmail);
    formData.append("isPublished", isPublished);
    submit(formData, { method: "post" });
  };

  const publishedOptions = [
    { label: "Published", value: "true" },
    { label: "Pending", value: "false" },
  ];

  // Create product options for select
  const productOptions = [
    { label: "Select a product...", value: "", disabled: true },
    ...products.map(product => ({
      label: product.title,
      value: product.id.replace('gid://shopify/Product/', '')
    }))
  ];

  // Find selected product for preview
  const selectedProduct = products.find(p =>
    p.id.replace('gid://shopify/Product/', '') === productId
  );

  return (
    <Page
      title="New Question"
      backAction={{content: "Back", onAction: () => navigate("/app")}}
    >
      <Layout>
        <Layout.Section>
          {actionData?.error && (
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" tone="critical">
                {actionData.error}
              </Text>
            </BlockStack>
          )}

          <Card>
            <BlockStack gap="500">
              <Text as="h2" variant="headingMd">
                Create New Question
              </Text>

              {/* Product Selector */}
              <Select
                label="Product"
                options={productOptions}
                onChange={setProductId}
                value={productId}
                helpText="Select the product this question is about"
              />

              {/* Product Preview */}
              {selectedProduct && (
                <Card>
                  <BlockStack gap="400">
                    <Text as="h3" variant="headingSm">Product Preview</Text>
                    <InlineStack gap="400" blockAlign="center">
                      <Thumbnail
                        source={selectedProduct.featuredImage?.url || ""}
                        alt={selectedProduct.featuredImage?.altText || selectedProduct.title}
                        size="large"
                      />
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="headingSm">{selectedProduct.title}</Text>
                          <Badge tone={selectedProduct.status === 'ACTIVE' ? 'success' : 'attention'}>
                            {selectedProduct.status}
                          </Badge>
                        </InlineStack>
                        {selectedProduct.description && (
                          <Text as="p" variant="bodyMd" tone="subdued">
                            {selectedProduct.description}
                          </Text>
                        )}
                        <InlineStack gap="200">
                          <Button
                            onClick={() => window.open(`https://${shop}/admin/products/${selectedProduct.id.replace('gid://shopify/Product/', '')}`, '_parent')}
                            size="slim"
                          >
                            Edit Product
                          </Button>
                          <Button
                            onClick={() => window.open(`https://${shop}/products/${selectedProduct.handle}`, '_blank')}
                            size="slim"
                            variant="plain"
                          >
                            View Product
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>
                  </BlockStack>
                </Card>
              )}

              <TextField
                label="Question"
                value={questionText}
                onChange={setQuestionText}
                multiline={3}
                autoComplete="off"
                helpText="Enter the customer's question"
              />
              <TextField
                label="Customer Name"
                value={customerName}
                onChange={setCustomerName}
                autoComplete="off"
                helpText="The name of the customer asking the question"
              />
              <TextField
                label="Customer Email"
                value={customerEmail}
                onChange={setCustomerEmail}
                type="email"
                autoComplete="off"
                helpText="Customer's email address (optional)"
              />
              <Select
                label="Status"
                options={publishedOptions}
                onChange={(value) => setIsPublished(value === "true")}
                value={isPublished ? "true" : "false"}
                helpText="Choose whether to publish immediately or keep as pending"
              />
              <InlineStack align="end">
                <Button onClick={() => navigate("/app")}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleSubmit}>
                  Create Question
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}