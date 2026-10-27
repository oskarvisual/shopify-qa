"""
Constructor de workflows n8n para bAInners.

Genera los workflows y los escribe en la base de datos de n8n (SQLite).
Uso: python3 build_workflows.py <workflow_json_payload>
"""

import sqlite3, json, uuid, datetime, base64, subprocess, sys

DB = "/var/lib/docker/volumes/n8n_data/_data/database.sqlite"
Q = chr(96)

# ---------------------------------------------------------------- helpers

def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def get_data_table_id(name="bainners_usage"):
    con = sqlite3.connect("file:%s?mode=ro" % DB, uri=True)
    cur = con.cursor()
    cur.execute("SELECT id FROM data_table WHERE name=?", (name,))
    row = cur.fetchone()
    con.close()
    if not row:
        raise SystemExit("Data table '%s' no encontrada" % name)
    return row[0]


def get_credential_id(name="DigitalOcean Spaces cdn-orivisdev"):
    con = sqlite3.connect("file:%s?mode=ro" % DB, uri=True)
    cur = con.cursor()
    cur.execute("SELECT id FROM credentials_entity WHERE name=?", (name,))
    row = cur.fetchone()
    con.close()
    if not row:
        raise SystemExit("Credencial '%s' no encontrada" % name)
    return row[0]


def get_project_id():
    con = sqlite3.connect("file:%s?mode=ro" % DB, uri=True)
    cur = con.cursor()
    cur.execute("SELECT id FROM project LIMIT 1")
    row = cur.fetchone()
    con.close()
    return row[0] if row else None


def upsert_workflow(wf_id, name, nodes, connections, active=1, settings=None):
    """Inserta o actualiza un workflow y sus conexiones.

    n8n 2.x exige que un workflow activo tenga una 'active version':
    una fila en workflow_history y el puntero activeVersionId en
    workflow_entity, mas la entrada en workflow_publish_history.
    """
    con = sqlite3.connect("file:%s?mode=rw" % DB, uri=True)
    cur = con.cursor()
    now = now_iso()
    nodes_json = json.dumps(nodes)
    conn_json = json.dumps(connections)
    settings_json = json.dumps(settings or {})

    cur.execute("SELECT id,activeVersionId FROM workflow_entity WHERE id=?", (wf_id,))
    exists = cur.fetchone()

    if exists:
        cur.execute(
            "UPDATE workflow_entity SET name=?, nodes=?, connections=?, active=?, "
            "settings=?, updatedAt=? WHERE id=?",
            (name, nodes_json, conn_json, active, settings_json, now, wf_id),
        )
        print("  actualizado:", wf_id, name)
    else:
        cur.execute(
            "INSERT INTO workflow_entity "
            "(id,name,nodes,connections,active,settings,createdAt,updatedAt,versionId) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (wf_id, name, nodes_json, conn_json, active, settings_json, now, now, str(uuid.uuid4())),
        )
        print("  creado:", wf_id, name)

    # --- version activa -------------------------------------------------
    cur.execute("SELECT activeVersionId FROM workflow_entity WHERE id=?", (wf_id,))
    row = cur.fetchone()
    active_version = row[0] if row else None

    if not active_version:
        # Crear una version en workflow_history
        version_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO workflow_history "
            "(versionId,workflowId,authors,createdAt,updatedAt,nodes,connections,name,autosaved,description) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (version_id, wf_id, "import", now, now, nodes_json, conn_json, name, False, None),
        )
        # Marcar como publicada. En n8n 2.x el CHECK constraint exige
        # 'activated' o 'deactivated', y 'id' es INTEGER autoincrement.
        cur.execute(
            "INSERT INTO workflow_publish_history (workflowId,versionId,event,userId,createdAt) "
            "VALUES (?,?,?,?,?)",
            (wf_id, version_id, "activated", None, now),
        )
        cur.execute(
            "UPDATE workflow_entity SET activeVersionId=?, versionCounter=1 WHERE id=?",
            (version_id, wf_id),
        )
        print("    version activa creada:", version_id)
    else:
        # Actualizar el contenido de la version activa
        cur.execute(
            "UPDATE workflow_history SET nodes=?, connections=?, name=?, updatedAt=? "
            "WHERE versionId=?",
            (nodes_json, conn_json, name, now, active_version),
        )
        print("    version activa actualizada:", active_version)

    # --- shared_workflow -------------------------------------------------
    # n8n 2.x exige que cada workflow pertenezca a un project para poder
    # activarlo. Sin esta fila la activacion falla con SharedWorkflow.
    cur.execute("SELECT id FROM project LIMIT 1")
    pr = cur.fetchone()
    project_id = pr[0] if pr else None
    if project_id:
        cur.execute(
            "SELECT workflowId FROM shared_workflow WHERE workflowId=? AND projectId=?",
            (wf_id, project_id),
        )
        if not cur.fetchone():
            cur.execute(
                "INSERT INTO shared_workflow (workflowId,projectId,role,createdAt,updatedAt) "
                "VALUES (?,?,?,?,?)",
                (wf_id, project_id, "workflow:owner", now, now),
            )
            print("    shared_workflow: vinculado al project", project_id)

    # webhook_entity: el webhook debe existir para que n8n lo enrute.
    # En n8n 2.x la tabla no tiene columna 'id', la clave es webhookPath.
    for n in nodes:
        if n.get("type") != "n8n-nodes-base.webhook":
            continue
        p = n.get("parameters", {})
        path = p.get("path")
        if not path:
            continue
        cur.execute("SELECT webhookPath FROM webhook_entity WHERE webhookPath=?", (path,))
        if cur.fetchone():
            continue
        cur.execute(
            "INSERT INTO webhook_entity "
            "(workflowId, webhookPath, method, node, webhookId, pathLength) "
            "VALUES (?,?,?,?,?,?)",
            (wf_id, path, p.get("httpMethod", "POST"), n["id"],
             str(uuid.uuid4()), len(path)),
        )
        print("    webhook registrado:", path)

    con.commit()
    con.close()


# ---------------------------------------------------------------- nodes

def webhook(path, name, nid):
    return {
        "parameters": {
            "httpMethod": "POST",
            "path": path,
            "responseMode": "responseNode",
            "options": {},
        },
        "id": nid,
        "name": name,
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [0, 0],
        "webhookId": str(uuid.uuid4()),
    }


def code(js, name, nid, pos, on_error=None):
    node = {
        "parameters": {"jsCode": js},
        "id": nid,
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": pos,
    }
    if on_error:
        # Continua el flujo devolviendo un item vacio cuando el nodo falla,
        # para que el webhook pueda responder con un error claro.
        node["onError"] = on_error
        node["alwaysOutputData"] = True
    return node


def http_request(url, name, nid, pos, method="POST", body=None, headers=None, timeout=30000):
    params = {
        "method": method,
        "url": url,
        "options": {"timeout": timeout},
    }
    if headers:
        params["sendHeaders"] = True
        params["headerParameters"] = {"parameters": headers}
    if body is not None:
        params["sendBody"] = True
        params["specifyBody"] = "json"
        params["jsonBody"] = body
    return {
        "parameters": params,
        "id": nid,
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": pos,
    }


def respond(expr, name, nid, pos):
    """RespondToWebhook.

    'responseBody' con respondWith='json' debe ser una EXPRESION que
    devuelva un objeto (n8n lo evalua con getNodeParameter y luego lo
    parsea como JSON). Por eso se envuelve en ={{ ... }}.
    """
    if not expr.startswith("="):
        expr = "=" + expr
    return {
        "parameters": {"respondWith": "json", "responseBody": expr, "options": {}},
        "id": nid,
        "name": name,
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.4,
        "position": pos,
    }


def data_table(op, dt_id, name, nid, pos, columns=None, matching=None, extra=None,
               on_error=None):
    params = {
        "resource": "row",
        "operation": op,
        "dataTableId": {"__rl": True, "mode": "id", "value": dt_id},
    }
    if op in ("insert", "upsert"):
        params["columns"] = {
            "mappingMode": "defineBelow",
            "value": columns or {},
            "matchingColumns": matching or [],
        }
    if extra:
        params.update(extra)
    node = {
        "parameters": params,
        "id": nid,
        "name": name,
        "type": "n8n-nodes-base.dataTable",
        "typeVersion": 1,
        "position": pos,
    }
    if on_error:
        # Continua el flujo devolviendo un item vacio cuando la tabla no
        # tiene filas (n8n corta el flujo si un nodo devuelve 0 items).
        node["onError"] = on_error
    return node


def s3_upload(bucket, key_expr, name, nid, pos, cred_id, binary_prop="data",
              public=True):
    # El bucket no tiene bucket policy, asi que el ACL por defecto es privado
    # y las imagenes no se verian en el storefront. additionalFields.acl envia
    # el header x-amz-acl para que el objeto quede publico.
    additional = {"acl": "publicRead"} if public else {}

    return {
        "parameters": {
            "resource": "file",
            "operation": "upload",
            "bucketName": bucket,
            "fileName": key_expr,
            "binaryData": True,
            "binaryPropertyName": binary_prop,
            "additionalFields": additional,
            "options": {},
        },
        "id": nid,
        "name": name,
        "type": "n8n-nodes-base.s3",
        # El nodo 'n8n-nodes-base.s3' ("Sends data to any S3-compatible
        # service") solo tiene typeVersion 1. La version 2 pertenece al nodo
        # 'n8n-nodes-base.awsS3'. Usar version 2 aqui hace que el frontend
        # marque el nodo como modulo inexistente.
        "typeVersion": 1,
        "position": pos,
        "credentials": {"s3": {"id": cred_id, "name": "DigitalOcean Spaces cdn-orivisdev"}},
    }


def s3_delete(bucket, key_expr, name, nid, pos, cred_id):
    return {
        "parameters": {
            "resource": "file",
            "operation": "delete",
            "bucketName": bucket,
            "fileKey": key_expr,
            "options": {},
        },
        "id": nid,
        "name": name,
        "type": "n8n-nodes-base.s3",
        "typeVersion": 1,
        "position": pos,
        "credentials": {"s3": {"id": cred_id, "name": "DigitalOcean Spaces cdn-orivisdev"}},
    }


def http_download(url_expr, name, nid, pos):
    """Descarga binaria. La propiedad de salida por defecto es 'data'."""
    return {
        "parameters": {
            "method": "GET",
            "url": url_expr,
            "options": {
                "timeout": 60000,
                "response": {
                    "response": {
                        "responseFormat": "file",
                        "outputPropertyName": "data",
                    }
                },
            },
        },
        "id": nid,
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": pos,
    }


def conn(*pairs):
    """conn(("A","B"), ...) -> {"A": {"main": [[{"node":"B"}]]}}"""
    out = {}
    for src, dst in pairs:
        out.setdefault(src, {"main": [[]]})["main"][0].append({"node": dst, "type": "main", "index": 0})
    return out
