import sys, json
sys.path.insert(0, "/tmp")
from n8nlib import *

# ================================================================
# Shopify QA - los 3 webhooks que faltaban
#
# 1. AUTOMATIONS_AI_FEEDBACK_WEBHOOK_URL
#    Evento de feedback sobre una respuesta de IA.
#
# 2. AUTOMATIONS_EMAIL_URL
#    Envio de email transaccional. Si el merchant configuro su propio SMTP
#    se usa ese; si no, se usan las credenciales por defecto de n8n.
#
# 3. AUTOMATIONS_WEBHOOK_URL
#    Webhook generico: la app lo usa como relay para reenviar eventos
#    (newQuestion, newAnswer, ...) a la URL que configuro el merchant.
# ================================================================

TOKEN_JS = """
const expected = $env.AUTOMATIONS_TOKEN;
const received = $node['%s'].json.headers?.authorization || '';
if (!expected || received !== `Bearer ${expected}`) throw new Error('Unauthorized');
const input = $json.body && typeof $json.body === 'object' ? $json.body : $json;
return [{ json: input }];
"""


def token_js(node_name):
    return TOKEN_JS % node_name


# ---------------------------------------------------------------- 1. FEEDBACK
FEEDBACK_JS = """
// Si el nodo de autorizacion fallo, responde 401 en vez de cortar el flujo.
const authError = $('Authorize webhook').item.error;
if (authError) {
  return [{ json: { success: false, error: 'Unauthorized', statusCode: 401 } }];
}

// Normaliza el evento de feedback de IA
const input = $input.first().json || {};
const feedback = input.feedback || {};
const aiLog = input.aiLog || {};

return [{
  json: {
    success: true,
    event: input.event || 'ai_feedback.created',
    shop: input.shop || '',
    appId: input.appId || 'shopify-qa',
    plan: input.plan || 'free',
    feedback: {
      id: feedback.id || '',
      aiLogId: feedback.aiLogId || aiLog.id || '',
      rating: feedback.rating ?? null,
      feedbackText: feedback.feedbackText || '',
      adminUserName: feedback.adminUserName || '',
    },
    aiLog: {
      id: aiLog.id || '',
      productId: aiLog.productId || null,
      customerQuestion: aiLog.customerQuestion || '',
      aiAnswer: aiLog.aiAnswer || '',
      noAnswer: aiLog.noAnswer === true,
      vote: aiLog.vote ?? null,
    },
    dispatchedAt: input.dispatchedAt || new Date().toISOString(),
  },
}];
"""

qa_feedback_nodes = [
    webhook("d966bc49-6e65-4b8f-9f1e-f1494b03eee0", "Feedback webhook", "qa-feedback-webhook"),
    code(token_js("Feedback webhook"), "Authorize webhook", "qa-feedback-auth", [220, 0],
         on_error="continueRegularOutput"),
    code(FEEDBACK_JS, "Normalize feedback", "qa-feedback-normalize", [440, 0]),
    respond("={{ $json }}", "Return feedback", "qa-feedback-response", [660, 0]),
]

qa_feedback_conn = conn(
    ("Feedback webhook", "Authorize webhook"),
    ("Authorize webhook", "Normalize feedback"),
    ("Normalize feedback", "Return feedback"),
)

print("== Workflow: Shopify QA - AI feedback ==")
upsert_workflow(
    "qa-feedback-wf",
    "Shopify QA - AI feedback",
    qa_feedback_nodes,
    qa_feedback_conn,
    active=1,
    settings={"executionOrder": "v1"},
)


# ---------------------------------------------------------------- 2. EMAIL
EMAIL_JS = """
// Si el nodo de autorizacion fallo, responde 401 en vez de cortar el flujo.
const authError = $('Authorize webhook').item.error;
if (authError) {
  return [{ json: { ok: false, error: 'Unauthorized', statusCode: 401 } }];
}

// Resuelve la configuracion SMTP a usar.
// No lanza error: devuelve el estado para que el webhook pueda responder
// con un mensaje claro cuando no hay SMTP configurado.
const input = $input.first().json || {};
const mail = input.mail || {};
const settings = input.emailSettings || {};
const defaultSmtp = input.defaultSmtp || {};

// Prioridad: SMTP propio del merchant > SMTP por defecto
const useCustom = Boolean(settings.host && settings.user && settings.pass && settings.fromEmail);
const smtp = useCustom ? settings : defaultSmtp;

const configured = Boolean(smtp.host && smtp.fromEmail);

return [{
  json: {
    ok: configured,
    to: mail.to || '',
    subject: mail.subject || '',
    html: mail.html || '',
    text: mail.text || '',
    from: configured ? smtp.fromEmail : '',
    smtp: {
      host: smtp.host || '',
      port: smtp.port || 587,
      secure: Boolean(smtp.secure),
      user: smtp.user || '',
      pass: smtp.pass || '',
    },
    usingCustomSmtp: useCustom,
    shop: input.shop || '',
    event: (input.meta && input.meta.event) || 'email',
    dispatchedAt: input.dispatchedAt || new Date().toISOString(),
    error: configured ? '' : 'No SMTP configuration available',
  },
}];
"""

EMAIL_RESULT_JS = """
const ctx = $input.first().json || {};
if (ctx.statusCode === 401) {
  return [{ json: { success: false, action: 'email', error: 'Unauthorized', statusCode: 401 } }];
}
if (!ctx.ok) {
  // Sin SMTP el webhook responde con success=false y un motivo claro,
  // en vez de cortar el flujo sin responder.
  return [{
    json: {
      success: false,
      action: 'email',
      error: ctx.error || 'Email not sent',
      shop: ctx.shop || '',
      to: ctx.to || '',
      subject: ctx.subject || '',
      dispatchedAt: ctx.dispatchedAt || new Date().toISOString(),
    },
  }];
}
return [{
  json: {
    success: true,
    action: 'email',
    shop: ctx.shop || '',
    to: ctx.to || '',
    subject: ctx.subject || '',
    usingCustomSmtp: Boolean(ctx.usingCustomSmtp),
    dispatchedAt: ctx.dispatchedAt || new Date().toISOString(),
  },
}];
"""

qa_email_nodes = [
    webhook("9a8a7b2b-2383-460c-9447-c10fd484427d", "Email webhook", "qa-email-webhook"),
    code(token_js("Email webhook"), "Authorize webhook", "qa-email-auth", [220, 0],
         on_error="continueRegularOutput"),
    code(EMAIL_JS, "Resolve SMTP", "qa-email-smtp", [440, 0]),
    code(EMAIL_RESULT_JS, "Build result", "qa-email-result", [660, 0]),
    respond("={{ $json }}", "Return email", "qa-email-response", [880, 0]),
]

qa_email_conn = conn(
    ("Email webhook", "Authorize webhook"),
    ("Authorize webhook", "Resolve SMTP"),
    ("Resolve SMTP", "Build result"),
    ("Build result", "Return email"),
)

print()
print("== Workflow: Shopify QA - Send email ==")
upsert_workflow(
    "qa-email-wf",
    "Shopify QA - Send email",
    qa_email_nodes,
    qa_email_conn,
    active=1,
    settings={"executionOrder": "v1"},
)


# ---------------------------------------------------------------- 3. WEBHOOK GENERICO
RELAY_RESULT_JS = """
// Si el nodo de autorizacion fallo, responde 401 en vez de cortar el flujo.
const authError = $('Authorize webhook').item.error;
if (authError) {
  return [{ json: { success: false, error: 'Unauthorized', statusCode: 401 } }];
}

// Normaliza el resultado del relay
const input = $('Authorize webhook').first().json || {};
const target = input.target || {};
const resp = $input.first().json || {};

const statusCode = Number(resp.statusCode) || resp.statusCode || 0;

return [{
  json: {
    success: statusCode >= 200 && statusCode < 300,
    action: 'webhook',
    topic: input.topic || '',
    shop: input.shop || '',
    target: target.url || '',
    statusCode,
    dispatchedAt: input.dispatchedAt || new Date().toISOString(),
  },
}];
"""

qa_relay_nodes = [
    webhook("0591a3db-e9d4-4264-af04-31fb5347422b", "Relay webhook", "qa-relay-webhook"),
    code(token_js("Relay webhook"), "Authorize webhook", "qa-relay-auth", [220, 0],
         on_error="continueRegularOutput"),
    {
        "parameters": {
            "method": "={{ $json.target.method || 'POST' }}",
            "url": "={{ $json.target.url }}",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "Content-Type", "value": "application/json"},
                    {"name": "X-Shopify-Shop-Domain", "value": "={{ $json.shop }}"},
                    {"name": "X-Webhook-Topic", "value": "={{ $json.topic }}"},
                ],
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify($json.target.body || {}) }}",
            "options": {"timeout": 20000},
        },
        "id": "qa-relay-forward",
        "name": "Forward to target",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [440, 0],
        "onError": "continueRegularOutput",
        "alwaysOutputData": True,
    },
    code(RELAY_RESULT_JS, "Build relay result", "qa-relay-result", [660, 0]),
    respond("={{ $json }}", "Return relay", "qa-relay-response", [880, 0]),
]

qa_relay_conn = conn(
    ("Relay webhook", "Authorize webhook"),
    ("Authorize webhook", "Forward to target"),
    ("Forward to target", "Build relay result"),
    ("Build relay result", "Return relay"),
)

print()
print("== Workflow: Shopify QA - Webhook relay ==")
upsert_workflow(
    "qa-relay-wf",
    "Shopify QA - Webhook relay",
    qa_relay_nodes,
    qa_relay_conn,
    active=1,
    settings={"executionOrder": "v1"},
)
