import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { Page, Card, DataTable, Text, Badge, Modal, BlockStack, Thumbnail, InlineStack, Button, TextField, Spinner } from "@shopify/polaris";
import { ThumbsUpIcon, ThumbsDownIcon } from '@shopify/polaris-icons';
import { useState, useEffect, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;
  const adminUserId = session.userId ?? session.id;

  const logs = await prisma.aiLog.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    include: { feedback: true },
  });

  const productIds = [...new Set(logs.map(log => log.productId))].map(id => `gid://shopify/Product/${id}`);
  const productMap = {};

  if (productIds.length > 0) {
    const productResponse = await admin.graphql(`
      query getProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            featuredImage { url altText }
          }
        }
      }
    `, { variables: { ids: productIds } });
    const productData = await productResponse.json();
    productData.data?.nodes?.forEach(product => {
      if (product) {
        const numericId = product.id.replace('gid://shopify/Product/', '');
        productMap[numericId] = product;
      }
    });
  }

  return json({ initialLogs: logs, productMap, shop, adminUserId });
};

function AdminFeedback({ log, adminUserId, onFeedbackSuccess }) {
  const fetcher = useFetcher();
  const currentUserFeedback = log.feedback.find(f => String(f.adminUserId) === String(adminUserId));
  const [isEditing, setIsEditing] = useState(!currentUserFeedback);
  const [feedbackText, setFeedbackText] = useState(currentUserFeedback?.feedbackText || '');

  // Reset state when log changes or when currentUserFeedback changes
  useEffect(() => {
    setIsEditing(!currentUserFeedback);
    setFeedbackText(currentUserFeedback?.feedbackText || '');
  }, [log.id, currentUserFeedback]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      onFeedbackSuccess(fetcher.data.feedback);
      setIsEditing(false);
      setFeedbackText(currentUserFeedback?.feedbackText || '');
    }
  }, [fetcher.state, fetcher.data, onFeedbackSuccess]);

  const isSubmitting = fetcher.state === 'submitting';

  const handleEdit = () => {
    setFeedbackText(currentUserFeedback?.feedbackText || '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setFeedbackText(currentUserFeedback?.feedbackText || '');
    setIsEditing(false);
  };

  const submitFeedback = (rating) => {
    if (isSubmitting) return;

    fetcher.submit(
      { aiLogId: log.id, rating, feedbackText },
      { method: "post", action: "/api/ai-feedback", encType: "application/json" }
    );
  };

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd">Admin Feedback</Text>

        {log.feedback.length > 0 ? (
          <BlockStack gap="300">
            {log.feedback.map(fb => (
              <Card key={fb.id} background={String(fb.adminUserId) === String(adminUserId) ? "bg-surface-selected" : "bg-surface"}>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text fontWeight="bold">{fb.rating === 1 ? '👍 Helpful' : '👎 Not Helpful'}</Text>
                    <Text tone="subdued">by {fb.adminUserName || 'Admin'}</Text>
                  </InlineStack>
                  {fb.feedbackText && <Text as="p">{fb.feedbackText}</Text>}
                  {String(fb.adminUserId) === String(adminUserId) && !isEditing && (
                    <InlineStack align="end" blockAlign="center">
                      <Button size="slim" onClick={handleEdit}>Edit feedback</Button>
                    </InlineStack>
                  )}
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        ) : (
          <Text tone="subdued">No feedback submitted yet.</Text>
        )}

        {isEditing && (
          <BlockStack gap="300" as="fieldset" paddingBlockStart="400" borderBlockStart="divider">
            <Text variant="headingSm">{currentUserFeedback ? 'Edit your feedback' : 'Your feedback'}</Text>
            {isSubmitting ? (
                <BlockStack align="center"><Spinner size="small" /></BlockStack>
            ) : (
              <>
                <TextField
                  label="Optional Comment"
                  labelHidden
                  value={feedbackText}
                  onChange={setFeedbackText}
                  multiline={3}
                  autoComplete="off"
                  placeholder="Add a comment..."
                />
                <InlineStack gap="300" align="end">
                  {currentUserFeedback && (
                    <Button onClick={handleCancel}>Cancel</Button>
                  )}
                  <Button icon={ThumbsDownIcon} onClick={() => submitFeedback(-1)} disabled={isSubmitting}>Not Helpful</Button>
                  <Button icon={ThumbsUpIcon} variant="primary" onClick={() => submitFeedback(1)} disabled={isSubmitting}>Helpful</Button>
                </InlineStack>
              </>
            )}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

export default function AiLogsPage() {
  const { initialLogs, productMap, shop, adminUserId } = useLoaderData();
  const [logs, setLogs] = useState(initialLogs);
  const [activeLogId, setActiveLogId] = useState(null);

  const activeLog = logs.find(log => log.id === activeLogId);

  const handleFeedbackSuccess = useCallback((newFeedback) => {
    setLogs(prevLogs => {
      return prevLogs.map(log => {
        if (log.id === newFeedback.aiLogId) {
          const otherFeedbacks = log.feedback.filter(f => String(f.adminUserId) !== String(newFeedback.adminUserId));
          return { ...log, feedback: [...otherFeedbacks, newFeedback] };
        }
        return log;
      });
    });
    // We also need to update the activeLog in the modal to trigger a re-render of its content
    setActiveLogId(newFeedback.aiLogId);
  }, []);

  const rows = logs.map((log) => {
    const product = productMap[log.productId];
    const productCell = product ? (
      <BlockStack gap="200">
        <Text variant="bodyMd" fontWeight="semibold">{product.title}</Text>
        <InlineStack gap="200">
            <Button size="slim" url={`https://${shop}/admin/products/${log.productId}`} target="_blank">Edit</Button>
            <Button size="slim" url={`https://${shop}/products/${product.handle}`} target="_blank">View</Button>
        </InlineStack>
      </BlockStack>
    ) : 'Product not found';

    const positiveFeedbacks = log.feedback.filter(f => f.rating === 1).length;
    const negativeFeedbacks = log.feedback.filter(f => f.rating === -1).length;

    const questionCell = (
        <BlockStack gap="200">
            <div style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><Text as="span">{log.customerQuestion}</Text></div>
            <Button size="slim" variant="primary" onClick={() => setActiveLogId(log.id)}>View Details</Button>
        </BlockStack>
    );

    return [
        questionCell,
        productCell,
        log.vote === 1 ? <Badge tone="success">Helpful</Badge> : log.vote === -1 ? <Badge tone="critical">Not Helpful</Badge> : null,
        <InlineStack gap="200" blockAlign="center">{positiveFeedbacks > 0 && <Badge tone="success">{positiveFeedbacks} 👍</Badge>}{negativeFeedbacks > 0 && <Badge tone="critical">{negativeFeedbacks} 👎</Badge>}</InlineStack>,
        log.askedHuman ? <Badge tone="attention">Yes</Badge> : 'No',
        log.noAnswer ? <Badge tone="warning">Yes</Badge> : 'No',
        new Date(log.createdAt).toLocaleString(),
    ];
  });

  return (
    <Page title="AI Interaction Logs">
      {activeLog && (
        <Modal open onClose={() => setActiveLogId(null)} title="Log Details">
          <Modal.Section>
            <BlockStack gap="400">
              {productMap[activeLog.productId] && (
                <Card>
                  <InlineStack gap="400" blockAlign="center" wrap={false}>
                    <Thumbnail source={productMap[activeLog.productId].featuredImage?.url || ""} alt={productMap[activeLog.productId].featuredImage?.altText || productMap[activeLog.productId].title} size="large" />
                  <BlockStack gap="200">
                    <Text variant="headingMd">{productMap[activeLog.productId].title}</Text>
                    <InlineStack gap="200">
                        <Button size="slim" variant="primary" url={`https://${shop}/admin/products/${activeLog.productId}`} target="_blank">Edit Product</Button>
                        <Button size="slim" url={`https://${shop}/products/${productMap[activeLog.productId].handle}`} target="_blank">View on Storefront</Button>
                    </InlineStack>
                  </BlockStack>
                  </InlineStack>
                </Card>
              )}
              <Card><BlockStack gap="200"><Text variant="headingSm">Customer Question</Text><Text>{activeLog.customerQuestion}</Text></BlockStack></Card>
              <Card><BlockStack gap="200"><Text variant="headingSm">AI Answer</Text><Text>{activeLog.aiAnswer}</Text></BlockStack></Card>
              <AdminFeedback log={activeLog} adminUserId={adminUserId} onFeedbackSuccess={handleFeedbackSuccess} />
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
      <Card>
        <DataTable
          columnContentTypes={['text','text','text','text','text','text','text']}
          headings={['Customer Question','Product','Customer Vote','Admin Feedback','Asked Human?','AI Had No Answer?','Date']}
          rows={rows}
        />
      </Card>
    </Page>
  );
}
