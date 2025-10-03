import prisma from "../db.server";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useFetcher, Form } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Banner,
  ChoiceList,
  Button,
  TextField,
  Checkbox,
  Icon,
  Tooltip,
} from "@shopify/polaris";
import { QuestionCircleIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const [webhookSettings, emailSettings, helpConfigs] = await Promise.all([
    prisma.webhookSetting.findUnique({ where: { shop } }),
    prisma.emailSetting.findUnique({ where: { shop } }),
    prisma.config.findMany({
      where: {
        key: {
          in: ['help.email_notifications', 'help.webhooks']
        }
      }
    }),
  ]);

  const helpLinks = helpConfigs.reduce((acc, config) => {
    acc[config.key] = config.value;
    return acc;
  }, {});

  return json({
    webhookSettings: webhookSettings || {},
    emailSettings: emailSettings || {},
    helpLinks,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Action for testing SMTP connection
  if (intent === "test-smtp") {
    // ... logic to test connection will be added later
    return json({ testResult: "Not implemented yet." });
  }

  // Default action: Save all settings
  try {
    const webhookData = {
      url: formData.get("url"),
      newQuestion: formData.get("newQuestion") === "true",
      editQuestion: formData.get("editQuestion") === "true",
      deleteQuestion: formData.get("deleteQuestion") === "true",
      newAnswer: formData.get("newAnswer") === "true",
      editAnswer: formData.get("editAnswer") === "true",
      deleteAnswer: formData.get("deleteAnswer") === "true",
      approveQuestion: formData.get("approveQuestion") === "true",
      newVote: formData.get("newVote") === "true",
    };

    const emailData = {
      notificationsEnabled: formData.get("notificationsEnabled") === "true",
      notifyOnNewQuestion: formData.get("notifyOnNewQuestion") === "true",
      autoApproveQuestions: formData.get("autoApproveQuestions") === "true",
      notificationEmails: formData.get("notificationEmails") || null,
      smtpProvider: formData.get("smtpProvider") || "APP",
      smtpHost: formData.get("smtpHost") || null,
      smtpPort: Number(formData.get("smtpPort") || 0),
      smtpUser: formData.get("smtpUser") || null,
      smtpPass: formData.get("smtpPass") || null,
      smtpSecure: formData.get("smtpSecure") === "true",
    };

    await Promise.all([
      prisma.webhookSetting.upsert({
        where: { shop },
        update: webhookData,
        create: { ...webhookData, shop },
      }),
      prisma.emailSetting.upsert({
        where: { shop },
        update: emailData,
        create: { ...emailData, shop },
      }),
    ]);

    return json({ success: "Settings saved successfully." });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return json({ error: "Failed to save settings. Please try again." }, { status: 500 });
  }
};

export default function SettingsPage() {
  const { webhookSettings, emailSettings, helpLinks } = useLoaderData();
  const actionData = useActionData();
  const fetcher = useFetcher();

  // Combined state for both forms
  const [formState, setFormState] = useState({ ...webhookSettings, ...emailSettings, autoApproveQuestions: emailSettings?.autoApproveQuestions || false });

  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [showTestBanner, setShowTestBanner] = useState(false);

  useEffect(() => {
    if (actionData?.success) {
      setShowSuccessBanner(true);
    }
    if (actionData?.error) {
      setShowErrorBanner(true);
    }
  }, [actionData]);

  useEffect(() => {
    if (fetcher.data) {
      setShowTestBanner(true);
    }
  }, [fetcher.data]);

  const handleFormChange = useCallback((key) => (value) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleChoiceListChange = useCallback((key) => (value) => {
    setFormState((prev) => ({ ...prev, [key]: value[0] }));
  }, []);

  const handleTestConnection = useCallback(() => {
    const formData = new FormData();
    formData.append("smtpHost", formState.smtpHost || "");
    formData.append("smtpPort", formState.smtpPort || "");
    formData.append("smtpUser", formState.smtpUser || "");
    formData.append("smtpPass", formState.smtpPass || "");
    formData.append("smtpSecure", formState.smtpSecure ? "true" : "false");
    fetcher.submit(formData, { method: "post", action: "/api/email-test" });
  }, [formState, fetcher]);


  const successBanner = showSuccessBanner && actionData?.success && (
    <Banner title="Success" tone="success" onDismiss={() => setShowSuccessBanner(false)}>
      <p>{actionData.success}</p>
    </Banner>
  );

  const errorBanner = showErrorBanner && actionData?.error && (
    <Banner title="Error" tone="critical" onDismiss={() => setShowErrorBanner(false)}>
      <p>{actionData.error}</p>
    </Banner>
  );

  const testBanner = showTestBanner && fetcher.data && (
    <Banner
      title={fetcher.data.success ? "Success" : "Error"}
      tone={fetcher.data.success ? "success" : "critical"}
      onDismiss={() => setShowTestBanner(false)}
    >
      <p>{fetcher.data.success || fetcher.data.error}</p>
    </Banner>
  );

  return (
    <Page title="Settings">
      <Form method="post">
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              {successBanner}
              {errorBanner}
              {testBanner}
            </BlockStack>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <Text variant="headingMd">Questions</Text>
                <input type="hidden" name="autoApproveQuestions" value={formState.autoApproveQuestions ? "true" : "false"} />
                <Checkbox
                  label="Auto-approve new questions"
                  checked={formState.autoApproveQuestions}
                  onChange={handleFormChange("autoApproveQuestions")}
                  helpText="If checked, new questions will be published automatically."
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd">Email Notifications</Text>
                  <Tooltip content="Help">
                    <Button
                      variant="plain"
                      onClick={helpLinks['help.email_notifications'] ? () => window.open(helpLinks['help.email_notifications'], '_blank') : undefined}
                      disabled={!helpLinks['help.email_notifications']}
                    >
                      <Icon source={QuestionCircleIcon} />
                    </Button>
                  </Tooltip>
                </InlineStack>
                
                <input type="hidden" name="notificationsEnabled" value={formState.notificationsEnabled ? "true" : "false"} />
                <Checkbox
                  label="Enable Email Notifications"
                  checked={formState.notificationsEnabled}
                  onChange={handleFormChange("notificationsEnabled")}
                  helpText="If checked, emails will be sent for enabled events below. This is the master switch for all email notifications."
                />

                {formState.notificationsEnabled && (
                  <BlockStack gap="500">
                    <input type="hidden" name="notifyOnNewQuestion" value={formState.notifyOnNewQuestion ? "true" : "false"} />
                    <Checkbox
                      label="Notify on New Questions"
                      checked={formState.notifyOnNewQuestion}
                      onChange={handleFormChange("notifyOnNewQuestion")}
                      helpText="Send a notification to administrators when a new question is submitted."
                    />
                    {formState.notifyOnNewQuestion && (
                      <TextField
                        label="Administrator Emails"
                        name="notificationEmails"
                        value={formState.notificationEmails || ""}
                        onChange={handleFormChange("notificationEmails")}
                        helpText="Comma-separated list of emails that will receive notifications."
                        autoComplete="off"
                      />
                    )}

                    <ChoiceList
                      title="Email Provider"
                      choices={[
                        { label: "Use App's Email Provider", value: "APP" },
                        { label: "Use Custom SMTP Server", value: "CUSTOM" },
                      ]}
                      selected={[formState.smtpProvider || "APP"]}
                      onChange={handleChoiceListChange("smtpProvider")}
                    />
                    <input type="hidden" name="smtpProvider" value={formState.smtpProvider || "APP"} />

                    {formState.smtpProvider === 'CUSTOM' && (
                      <BlockStack gap="300">
                        <Text variant="headingSm">Custom SMTP Settings</Text>
                        <TextField label="SMTP Host" name="smtpHost" value={formState.smtpHost || ''} onChange={handleFormChange('smtpHost')} autoComplete="off" />
                        <TextField label="SMTP Port" name="smtpPort" value={formState.smtpPort || ''} onChange={handleFormChange('smtpPort')} autoComplete="off" type="number" />
                        <TextField label="SMTP Username" name="smtpUser" value={formState.smtpUser || ''} onChange={handleFormChange('smtpUser')} autoComplete="off" />
                        <TextField label="SMTP Password" name="smtpPass" value={formState.smtpPass || ''} onChange={handleFormChange('smtpPass')} autoComplete="password" type="password" />
                        <input type="hidden" name="smtpSecure" value={formState.smtpSecure ? "true" : "false"} />
                        <Checkbox label="Use SSL/TLS" checked={formState.smtpSecure} onChange={handleFormChange('smtpSecure')} />
                        <Button onClick={handleTestConnection} disabled={fetcher.state === 'submitting'}>
                          {fetcher.state === 'submitting' ? 'Testing...' : 'Test Connection'}
                        </Button>
                      </BlockStack>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd">Webhooks</Text>
                  <Tooltip content="Help">
                    <Button
                      variant="plain"
                      onClick={helpLinks['help.webhooks'] ? () => window.open(helpLinks['help.webhooks'], '_blank') : undefined}
                      disabled={!helpLinks['help.webhooks']}
                    >
                      <Icon source={QuestionCircleIcon} />
                    </Button>
                  </Tooltip>
                </InlineStack>
                <TextField
                  label="Webhook Endpoint URL"
                  name="url"
                  value={formState.url || ""}
                  onChange={handleFormChange("url")}
                  autoComplete="off"
                />
                <BlockStack gap="200">
                  <input type="hidden" name="newQuestion" value={formState.newQuestion ? "true" : "false"} />
                  <Checkbox
                    label="New Question"
                    checked={formState.newQuestion}
                    onChange={handleFormChange("newQuestion")}
                  />
                  <input type="hidden" name="editQuestion" value={formState.editQuestion ? "true" : "false"} />
                  <Checkbox
                    label="Edit Question"
                    checked={formState.editQuestion}
                    onChange={handleFormChange("editQuestion")}
                  />
                  <input type="hidden" name="deleteQuestion" value={formState.deleteQuestion ? "true" : "false"} />
                  <Checkbox
                    label="Delete Question"
                    checked={formState.deleteQuestion}
                    onChange={handleFormChange("deleteQuestion")}
                  />
                  <input type="hidden" name="newAnswer" value={formState.newAnswer ? "true" : "false"} />
                  <Checkbox
                    label="New Answer"
                    checked={formState.newAnswer}
                    onChange={handleFormChange("newAnswer")}
                  />
                  <input type="hidden" name="editAnswer" value={formState.editAnswer ? "true" : "false"} />
                  <Checkbox
                    label="Edit Answer"
                    checked={formState.editAnswer}
                    onChange={handleFormChange("editAnswer")}
                  />
                  <input type="hidden" name="deleteAnswer" value={formState.deleteAnswer ? "true" : "false"} />
                  <Checkbox
                    label="Delete Answer"
                    checked={formState.deleteAnswer}
                    onChange={handleFormChange("deleteAnswer")}
                  />
                  <input type="hidden" name="approveQuestion" value={formState.approveQuestion ? "true" : "false"} />
                  <Checkbox
                    label="Approve Question"
                    checked={formState.approveQuestion}
                    onChange={handleFormChange("approveQuestion")}
                  />
                  <input type="hidden" name="newVote" value={formState.newVote ? "true" : "false"} />
                  <Checkbox
                    label="New Vote"
                    checked={formState.newVote}
                    onChange={handleFormChange("newVote")}
                  />
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Button submit fullWidth size="large">Save Settings</Button>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}
