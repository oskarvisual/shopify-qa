# n8n workflow builders (Shopify QA)

Scripts que generan los workflows de n8n de la app de Questions & Answers y
los escriben en la base de datos SQLite de n8n.

Ver `../../shopify-bainners/scripts/n8n/README.md` para el detalle de las
trampas de n8n 2.x (Data Tables físicas, active version, `shared_workflow`,
`keyValue` vs `value`, resourceMapper sin expresiones, S3 v1 vs v2).

## Workflows

| Script | Workflow | Webhook |
|---|---|---|
| `wf_qa_ai.py` | Shopify QA - AI answer (Gemini Flash) | `f7a4ffa5-9ce7-431d-a5df-4a12039885d0` |
| `wf_qa_rest.py` | Shopify QA - AI feedback | `d966bc49-6e65-4b8f-9f1e-f1494b03eee0` |
| | Shopify QA - Send email | `9a8a7b2b-2383-460c-9447-c10fd484427d` |
| | Shopify QA - Webhook relay | `0591a3db-e9d4-4264-af04-31fb5347422b` |

## SMTP (Amazon SES)

El workflow de email usa el nodo `Send Email` (`n8n-nodes-base.emailSend`,
typeVersion 2.1) con la credencial SMTP **"Amazon SES"**.

La credencial está cifrada en la base de datos de n8n con la
`N8N_ENCRYPTION_KEY` (AES-256-CBC + `EVP_BytesToKey`, prefijo `Salted__`).
Para crearla o rotarla hay que cifrar el JSON:

```json
{
  "host": "email-smtp.us-east-2.amazonaws.com",
  "port": 25,
  "secure": false,
  "ignoreTLS": false,
  "requireTLS": true,
  "user": "<AWS_ACCESS_KEY_ID>",
  "password": "<AWS_SECRET_ACCESS_KEY>",
  "name": "0rivisdev",
  "email": "noreply@orivisdev.shop"
}
```

El remitente por defecto es `noreply@orivisdev.shop` ("0rivisdev"). Amazon SES
no necesita verificar el remitente si la cuenta esta fuera del sandbox, pero
si el destino no esta verificado en sandbox el envio se rechaza.

Las variables `SMTP_*` en `/srv/n8n/.env` son la copia legible del
credential y se pasan al contenedor por el `docker-compose.yml`.


## Uso

```bash
export N8N_SSH_HOST=root@147.182.184.234
export N8N_SSH_KEY=~/.ssh/id_rsa

python3 scripts/n8n/run_remote.py scripts/n8n/wf_qa_ai.py
python3 scripts/n8n/run_remote.py scripts/n8n/wf_qa_rest.py

ssh "$N8N_SSH_HOST" 'docker restart n8n-n8n-1'
```

## Modelo de IA

El workflow usa **Gemini Flash** a través de la API de KIE:

```
POST https://api.kie.ai/v1/chat/completions
model: gemini-3-8-flash-openai
```

El sufijo `-openai` es necesario: KIE expone los modelos Gemini con
compatibilidad OpenAI solo bajo ese alias. Con `gemini-3-8-flash` a secas la
API responde `422 The model is not supported`.

> El workflow anterior usaba `gpt-5.5`, que KIE retiró
> ("retired from Codex with ChatGPT sign-in on October 14, 2026").

La respuesta de KIE es compatible con el formato OpenAI
(`choices[0].message.content`), que es lo que consume el nodo
"Normalize answer".

## Cuota diaria de IA

El contador vive en la Data Table `qa_ai_usage` con la clave `(shop, date)`.
Es la fuente de verdad: n8n incrementa la fila en cada peticion atendida.

Reglas aplicadas en el nodo "Enforce quota":

1. **Solo los planes con `aiCustomerSupport`** (ultra) pueden generar
   respuestas. Para el resto responde `plan_not_enabled`.
2. **Nunca mas de `aiDailyLimit` por dia**. Ese valor lo calcula la app por
   shop (`getSubscriptionPlanContext`, default 200) y se aplica con un tope
   duro de 100.

Cuando se agota la cuota responde:

```json
{
  "answer": false,
  "message": "",
  "noAnswer": true,
  "error": "Daily AI limit reached (100 per day)",
  "reason": "daily_limit_reached",
  "statusCode": 403
}
```

La app registra el intento en `aiLog` y el motivo queda visible en
`fullContext`.

> El body de la petición a KIE debe leer el payload del nodo
> `Authorize webhook` (`$('Authorize webhook').first().json`), no el del nodo
> anterior: `Enforce quota` solo tiene los datos de cuota y mandaría un
> contexto vacío, con lo que Gemini respondería `NO_RESPONSE_AVAILABLE`.

## Contratos de respuesta

La app espera que el webhook de AI answer devuelva:

```json
{ "answer": true, "message": "La camiseta es 100% algodón.", "noAnswer": false }
```

Los otros tres workflows responden con `success: true/false` y un `error`
cuando no pueden completar la acción (por ejemplo, sin SMTP configurado).
