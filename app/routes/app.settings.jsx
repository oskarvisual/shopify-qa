import { json } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Checkbox,
  Button,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const webhookSettings = await prisma.webhookSetting.findUnique({
    where: { shop },
  });

  return json({ webhookSettings: webhookSettings || {} });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const formData = await request.formData();

  const data = {
    url: formData.get("url"),
    newQuestion: formData.get("newQuestion") === "true",
    editQuestion: formData.get("editQuestion") === "true",
    deleteQuestion: formData.get("deleteQuestion") === "true",
    newAnswer: formData.get("newAnswer") === "true",
    editAnswer: formData.get("editAnswer") === "true",
    deleteAnswer: formData.get("deleteAnswer") === "true",
    approveQuestion: formData.get("approveQuestion") === "true",
  };

  await prisma.webhookSetting.upsert({
    where: { shop },
    update: data,
    create: { ...data, shop },
  });

  return json({ success: true });
};

export default function SettingsPage() {
  const { webhookSettings } = useLoaderData();
  const [formState, setFormState] = useState(webhookSettings);

  const handleCheckboxChange = useCallback((key) => (value) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <Card>
            <Form method="post">
              <BlockStack gap="500">
                <Text variant="headingMd">Webhooks</Text>
                <TextField
                  label="Webhook Endpoint URL"
                  name="url"
                  value={formState.url || ""}
                  onChange={(value) => setFormState((prev) => ({ ...prev, url: value }))}
                  autoComplete="off"
                />
                <BlockStack gap="200">
                  <input type="hidden" name="newQuestion" value={formState.newQuestion ? "true" : "false"} />
                  <Checkbox
                    label="New Question"
                    checked={formState.newQuestion}
                    onChange={handleCheckboxChange("newQuestion")}
                  />
                  <input type="hidden" name="editQuestion" value={formState.editQuestion ? "true" : "false"} />
                  <Checkbox
                    label="Edit Question"
                    checked={formState.editQuestion}
                    onChange={handleCheckboxChange("editQuestion")}
                  />
                  <input type="hidden" name="deleteQuestion" value={formState.deleteQuestion ? "true" : "false"} />
                  <Checkbox
                    label="Delete Question"
                    checked={formState.deleteQuestion}
                    onChange={handleCheckboxChange("deleteQuestion")}
                  />
                  <input type="hidden" name="newAnswer" value={formState.newAnswer ? "true" : "false"} />
                  <Checkbox
                    label="New Answer"
                    checked={formState.newAnswer}
                    onChange={handleCheckboxChange("newAnswer")}
                  />
                  <input type="hidden" name="editAnswer" value={formState.editAnswer ? "true" : "false"} />
                  <Checkbox
                    label="Edit Answer"
                    checked={formState.editAnswer}
                    onChange={handleCheckboxChange("editAnswer")}
                  />
                  <input type="hidden" name="deleteAnswer" value={formState.deleteAnswer ? "true" : "false"} />
                  <Checkbox
                    label="Delete Answer"
                    checked={formState.deleteAnswer}
                    onChange={handleCheckboxChange("deleteAnswer")}
                  />
                  <input type="hidden" name="approveQuestion" value={formState.approveQuestion ? "true" : "false"} />
                  <Checkbox
                    label="Approve Question"
                    checked={formState.approveQuestion}
                    onChange={handleCheckboxChange("approveQuestion")}
                  />
                </BlockStack>
                <Button submit>Save</Button>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}