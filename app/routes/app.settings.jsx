
import { json } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
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
    newQuestion: formData.get("newQuestion") === "on",
    editQuestion: formData.get("editQuestion") === "on",
    deleteQuestion: formData.get("deleteQuestion") === "on",
    newAnswer: formData.get("newAnswer") === "on",
    editAnswer: formData.get("editAnswer") === "on",
    deleteAnswer: formData.get("deleteAnswer") === "on",
    approveQuestion: formData.get("approveQuestion") === "on",
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
                  defaultValue={webhookSettings.url || ""}
                  autoComplete="off"
                />
                <BlockStack gap="200">
                  <Checkbox
                    label="New Question"
                    name="newQuestion"
                    defaultChecked={webhookSettings.newQuestion}
                  />
                  <Checkbox
                    label="Edit Question"
                    name="editQuestion"
                    defaultChecked={webhookSettings.editQuestion}
                  />
                  <Checkbox
                    label="Delete Question"
                    name="deleteQuestion"
                    defaultChecked={webhookSettings.deleteQuestion}
                  />
                  <Checkbox
                    label="New Answer"
                    name="newAnswer"
                    defaultChecked={webhookSettings.newAnswer}
                  />
                  <Checkbox
                    label="Edit Answer"
                    name="editAnswer"
                    defaultChecked={webhookSettings.editAnswer}
                  />
                  <Checkbox
                    label="Delete Answer"
                    name="deleteAnswer"
                    defaultChecked={webhookSettings.deleteAnswer}
                  />
                  <Checkbox
                    label="Approve Question"
                    name="approveQuestion"
                    defaultChecked={webhookSettings.approveQuestion}
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
