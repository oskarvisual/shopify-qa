import { json } from "@remix-run/node";
import {
  useActionData,
  useSubmit,
  useNavigate,
  useLoaderData,
  Form,
} from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import Papa from "papaparse";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Grid,
  DropZone,
  Thumbnail,
  Select,
  Banner,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GET_PRODUCT_DETAILS_QUERY = `
  query getProductDetails($id: ID!) {
    product(id: $id) {
      productType
      tags
    }
  }
`;

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const totalQuestions = await prisma.question.count({ where: { shop } });
  const totalAnswers = await prisma.answer.count({
    where: { question: { shop } },
  });

  return json({
    totalQuestions,
    totalAnswers,
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;

  const formData = await request.formData();
  const actionType = formData.get("actionType");
  const today = new Date().toISOString().split("T")[0];

  if (actionType === "export-questions") {
    const questions = await prisma.question.findMany({ where: { shop }, orderBy: { createdAt: "desc" } });
    const csvHeaders = ["question_export_id", "productId", "productType", "productCategory", "productTags", "customerName", "customerEmail", "question", "isPublished", "createdAt", "votes"].join(",");
    const csvRows = questions.map((q, index) => {
      const escapeCsv = (str) => `"${String(str || "").replace(/"/g, '""')}"`
      const exportId = `q${index + 1}`;
      return [exportId, q.productId, escapeCsv(q.productType), escapeCsv(q.productCategory), escapeCsv(q.productTags), escapeCsv(q.customerName), escapeCsv(q.customerEmail), escapeCsv(q.question), q.isPublished, q.createdAt.toISOString(), q.votes].join(",");
    });
    const csvContent = [csvHeaders, ...csvRows].join("\n");
    const filename = `questions-export-${today}.csv`;
    return json({ csvContent, filename });
  }

  if (actionType === "export-answers") {
    // Get questions to create mapping from internal ID to export ID
    const questions = await prisma.question.findMany({ where: { shop }, orderBy: { createdAt: "desc" } });
    const questionIdToExportId = {};
    questions.forEach((q, index) => {
      questionIdToExportId[q.id] = `q${index + 1}`;
    });

    const answers = await prisma.answer.findMany({ where: { question: { shop } }, orderBy: { createdAt: "desc" } });
    const csvHeaders = ["question_export_id", "authorName", "authorEmail", "answer", "isPublished", "createdAt"].join(",");
    const csvRows = answers.map((a) => {
      const escapeCsv = (str) => `"${String(str || "").replace(/"/g, '""')}"`
      const exportId = questionIdToExportId[a.questionId] || "unknown";
      return [exportId, escapeCsv(a.authorName), escapeCsv(a.authorEmail), escapeCsv(a.answer), a.isPublished, a.createdAt.toISOString()].join(",");
    });
    const csvContent = [csvHeaders, ...csvRows].join("\n");
    const filename = `answers-export-${today}.csv`;
    return json({ csvContent, filename });
  }

  if (actionType === "import-questions") {
    const file = formData.get("file");
    if (!file || typeof file === "string" || !file.name) {
      return json({ error: "No file provided or invalid file format." }, { status: 400 });
    }

    const csv = await file.text();
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });

    if (parsed.errors.length) {
      return json({ error: `CSV parsing error on row ${parsed.errors[0].row}: ${parsed.errors[0].message}` }, { status: 400 });
    }

    // Validate CSV structure
    if (parsed.data.length === 0) {
      return json({ error: "CSV file is empty or has no valid data rows." }, { status: 400 });
    }

    const requiredFields = ['question_export_id', 'productId', 'question'];
    const missingFields = requiredFields.filter(field =>
      !parsed.data[0].hasOwnProperty(field)
    );

    if (missingFields.length > 0) {
      return json({
        error: `Missing required CSV columns: ${missingFields.join(', ')}. Expected columns: ${requiredFields.join(', ')}`
      }, { status: 400 });
    }

    let createdCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const rowNumber = i + 2; // +2 because of header and 1-based indexing

      try {
        // Validate required fields for this row
        if (!row.question_export_id?.trim()) {
          errors.push(`Row ${rowNumber}: Missing question_export_id`);
          errorCount++;
          continue;
        }

        if (!row.productId?.trim()) {
          errors.push(`Row ${rowNumber}: Missing productId`);
          errorCount++;
          continue;
        }

        if (!row.question?.trim()) {
          errors.push(`Row ${rowNumber}: Missing question text`);
          errorCount++;
          continue;
        }

        // Validate date format if provided
        let createdAt = new Date();
        if (row.createdAt) {
          createdAt = new Date(row.createdAt);
          if (isNaN(createdAt.getTime())) {
            errors.push(`Row ${rowNumber}: Invalid date format in createdAt: '${row.createdAt}'`);
            errorCount++;
            continue;
          }
        }

        // Validate votes if provided
        let votes = 0;
        if (row.votes && row.votes.trim() !== '') {
          votes = parseInt(row.votes, 10);
          if (isNaN(votes)) {
            errors.push(`Row ${rowNumber}: Invalid votes value: '${row.votes}' (must be a number)`);
            errorCount++;
            continue;
          }
        }

        let productType = null;
        let productCategory = null;
        let productTags = null;

        // Try to fetch product details from Shopify
        try {
          const response = await admin.graphql(GET_PRODUCT_DETAILS_QUERY, {
            variables: { id: `gid://shopify/Product/${String(row.productId).trim()}` },
          });

          const productDetails = await response.json();
          const product = productDetails.data?.product;

          if (product) {
            productType = product.productType;
            productTags = product.tags?.join(', ');
            // Use product type as fallback category
            productCategory = productType ? productType.charAt(0).toUpperCase() + productType.slice(1) : null;
          }
        } catch (productError) {
          console.warn(`Failed to fetch product details for product ${row.productId}:`, productError.message);
          // Continue without product details
        }

        await prisma.question.create({
          data: {
            shop,
            originalImportId: String(row.question_export_id).trim(),
            productId: String(row.productId).trim(),
            customerName: String(row.customerName || "").trim(),
            customerEmail: String(row.customerEmail || "").trim(),
            question: String(row.question).trim(),
            isPublished: String(row.isPublished || "false").toLowerCase() === "true",
            createdAt: createdAt,
            votes: votes,
            productType,
            productCategory,
            productTags,
          }
        });
        createdCount++;
      } catch (e) {
        errorCount++;
        if (e.code === 'P2002') {
          errors.push(`Row ${rowNumber}: Duplicate question_export_id '${row.question_export_id}'`);
        } else {
          errors.push(`Row ${rowNumber}: Database error - ${e.message}`);
        }
        console.error(`Failed to import question on row ${rowNumber}:`, e);
      }
    }

    let message = `Import completed: ${createdCount} questions imported successfully`;
    if (errorCount > 0) {
      message += `, ${errorCount} rows failed`;
    }

    const response = { success: message };
    if (errors.length > 0) {
      response.warnings = errors.slice(0, 10); // Show first 10 errors
      if (errors.length > 10) {
        response.warnings.push(`... and ${errors.length - 10} more errors`);
      }
    }

    return json(response);
  }

  if (actionType === "import-answers") {
    const file = formData.get("file");
    if (!file || typeof file === "string" || !file.name) {
      return json({ error: "No file provided or invalid file format." }, { status: 400 });
    }

    const csv = await file.text();
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });

    if (parsed.errors.length) {
      return json({ error: `CSV parsing error on row ${parsed.errors[0].row}: ${parsed.errors[0].message}` }, { status: 400 });
    }

    // Validate CSV structure
    if (parsed.data.length === 0) {
      return json({ error: "CSV file is empty or has no valid data rows." }, { status: 400 });
    }

    const requiredFields = ['question_export_id', 'answer'];
    const missingFields = requiredFields.filter(field =>
      !parsed.data[0].hasOwnProperty(field)
    );

    if (missingFields.length > 0) {
      return json({
        error: `Missing required CSV columns: ${missingFields.join(', ')}. Expected columns: ${requiredFields.join(', ')}`
      }, { status: 400 });
    }

    // Cache questions for better performance
    const allQuestionsForShop = await prisma.question.findMany({
      where: { shop: shop },
      select: { id: true, originalImportId: true },
    });

    const questionMap = {};
    allQuestionsForShop.forEach(q => {
      if (q.originalImportId) {
        questionMap[q.originalImportId] = q.id;
      }
    });

    let createdCount = 0;
    let errorCount = 0;
    const errors = [];
    const missingQuestionIds = new Set();

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const rowNumber = i + 2; // +2 because of header and 1-based indexing

      try {
        // Validate required fields for this row
        if (!row.question_export_id?.trim()) {
          errors.push(`Row ${rowNumber}: Missing question_export_id`);
          errorCount++;
          continue;
        }

        if (!row.answer?.trim()) {
          errors.push(`Row ${rowNumber}: Missing answer text`);
          errorCount++;
          continue;
        }

        const importId = String(row.question_export_id).trim();
        const questionId = questionMap[importId];

        if (!questionId) {
          errors.push(`Row ${rowNumber}: No question found with ID '${importId}'`);
          missingQuestionIds.add(importId);
          errorCount++;
          continue;
        }

        // Validate date format if provided
        let createdAt = new Date();
        if (row.createdAt) {
          createdAt = new Date(row.createdAt);
          if (isNaN(createdAt.getTime())) {
            errors.push(`Row ${rowNumber}: Invalid date format in createdAt: '${row.createdAt}'`);
            errorCount++;
            continue;
          }
        }

        // Validate email format if provided
        if (row.authorEmail && row.authorEmail.trim() !== '') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(row.authorEmail.trim())) {
            errors.push(`Row ${rowNumber}: Invalid email format: '${row.authorEmail}'`);
            errorCount++;
            continue;
          }
        }

        await prisma.answer.create({
          data: {
            questionId: questionId,
            authorName: String(row.authorName || "").trim(),
            authorEmail: String(row.authorEmail || "").trim(),
            answer: String(row.answer).trim(),
            isPublished: String(row.isPublished || "false").toLowerCase() === "true",
            createdAt: createdAt,
          },
        });
        createdCount++;
      } catch (e) {
        errorCount++;
        if (e.code === 'P2002') {
          errors.push(`Row ${rowNumber}: Duplicate answer detected`);
        } else {
          errors.push(`Row ${rowNumber}: Database error - ${e.message}`);
        }
        console.error(`Failed to import answer on row ${rowNumber}:`, e);
      }
    }

    let message = `Import completed: ${createdCount} answers imported successfully`;
    if (errorCount > 0) {
      message += `, ${errorCount} rows failed`;
    }

    const response = { success: message };

    if (errors.length > 0) {
      response.warnings = errors.slice(0, 10); // Show first 10 errors
      if (errors.length > 10) {
        response.warnings.push(`... and ${errors.length - 10} more errors`);
      }
    }

    if (missingQuestionIds.size > 0) {
      const availableIds = allQuestionsForShop
        .filter(q => q.originalImportId)
        .map(q => q.originalImportId)
        .slice(0, 5);

      response.info = `Missing question IDs: ${Array.from(missingQuestionIds).slice(0, 5).join(', ')}${missingQuestionIds.size > 5 ? '...' : ''}. Available IDs in database: ${availableIds.join(', ')}${availableIds.length === 0 ? 'None found - make sure you import questions first!' : availableIds.length > 5 ? '...' : ''}`;
    }

    return json(response);
  }

  return json({ error: "Invalid action type" }, { status: 400 });
};

export default function ImportExportPage() {
  const { totalQuestions, totalAnswers } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigate = useNavigate();

  const [importType, setImportType] = useState("questions");
  const [files, setFiles] = useState([]);

  useEffect(() => {
    if (actionData?.csvContent && actionData?.filename) {
      const blob = new Blob([actionData.csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = actionData.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  }, [actionData]);

  const handleDropZoneDrop = useCallback((_droppedFiles, acceptedFiles, _rejectedFiles) => {
    setFiles(acceptedFiles);
  }, []);

  const handleImportTypeChange = useCallback((value) => {
    setImportType(value);
  }, []);

  const handleExport = (type) => {
    const formData = new FormData();
    formData.append("actionType", type);
    submit(formData, { method: "post" });
  };

  const handleImport = () => {
    if (files.length === 0) return;
    const formData = new FormData();
    formData.append("actionType", `import-${importType}`);
    formData.append("file", files[0]);
    submit(formData, { method: "post", encType: "multipart/form-data" });
  };

  const fileUpload = !files.length && <DropZone.FileUpload />;
  const uploadedFile = files.length > 0 && (
    <BlockStack gap="200">
      {files.map((file, index) => (
        <InlineStack key={index} gap="200" blockAlign="center">
          <Thumbnail
            size="small"
            alt={file.name}
            source="https://cdn.shopify.com/s/files/1/0757/9955/files/New_Project_5.png?v=1697828310"
          />
          <Text variant="bodyMd" as="p">{file.name}</Text>
        </InlineStack>
      ))}
    </BlockStack>
  );

  return (
    <Page
      title="Import & Export"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        {actionData?.error && (
          <Banner title="Error" tone="critical">{actionData.error}</Banner>
        )}
        {actionData?.success && (
          <Banner title="Success" tone="success">{actionData.success}</Banner>
        )}
        {actionData?.warnings && actionData.warnings.length > 0 && (
          <Banner title="Import Completed with Warnings" tone="warning">
            <BlockStack gap="200">
              <Text as="p">Some rows had issues:</Text>
              <BlockStack gap="100">
                {actionData.warnings.map((warning, index) => (
                  <Text key={index} as="p" variant="bodySm">• {warning}</Text>
                ))}
              </BlockStack>
            </BlockStack>
          </Banner>
        )}
        {actionData?.info && (
          <Banner title="Additional Information" tone="info">
            <Text as="p">{actionData.info}</Text>
          </Banner>
        )}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
            <Card>
              <BlockStack gap="500">
                <Text as="h2" variant="headingMd">Import Data</Text>
                <Select
                  label="Import Type"
                  options={[
                    { label: "Questions", value: "questions" },
                    { label: "Answers", value: "answers" },
                  ]}
                  onChange={handleImportTypeChange}
                  value={importType}
                />
                <DropZone onDrop={handleDropZoneDrop} accept=".csv">
                  {uploadedFile}
                  {fileUpload}
                </DropZone>
                <Button onClick={handleImport} disabled={files.length === 0}>
                  Upload and Import
                </Button>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}>
            <Card>
              <BlockStack gap="500">
                <Text as="h2" variant="headingMd">Export Data</Text>
                <BlockStack gap="200">
                  <Text as="p">Total Questions: {totalQuestions}</Text>
                  <Text as="p">Total Answers: {totalAnswers}</Text>
                </BlockStack>
                <InlineStack gap="300" align="end">
                  <Button onClick={() => handleExport("export-questions")}>Export Questions</Button>
                  <Button onClick={() => handleExport("export-answers")} variant="primary">Export Answers</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>
        <Card>
          <BlockStack gap="400">
            <Text as="h3" variant="headingMd">CSV Format Instructions</Text>
            <Text as="p">Import your data in a two-step process: first upload your questions, then your answers.</Text>
            <Text as="h4" variant="headingSm">Step 1: For Questions (questions.csv)</Text>
            <pre><code>
              {`question_export_id,productId,customerName,customerEmail,question,isPublished,createdAt,votes\n"q1","8954910335289","John Doe","john@example.com","What is the fabric?","true","2025-01-01T00:00:00.000Z",10`}
            </code></pre>
            <Text as="p" tone="subdued">
              The `question_export_id` is a unique identifier from your old system. It will be stored and used to link answers in the next step.
            </Text>
            <Text as="h4" variant="headingSm">Step 2: For Answers (answers.csv)</Text>
            <pre><code>
              {`question_export_id,authorName,authorEmail,answer,isPublished,createdAt\n"q1","Shop Owner","owner@example.com","It is 100% cotton.","true","2025-01-02T00:00:00.000Z"`}
            </code></pre>
            <Text as="p" tone="subdued">
              The `question_export_id` in this file **must** match an ID from your `questions.csv` file.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}