# 🔌 REST API & A2A Agent Protocols

The portal offers public REST APIs for developers, mobile apps, and autonomous AI agents.

---

## 📡 REST Endpoints Summary

| Method | Endpoint | Description | Cache / Rate Policy |
| :--- | :--- | :--- | :--- |
| `GET`, `POST` | `/api/search` | Search academic results and marksheets by roll number. | Public, 200 OK |
| `GET`, `POST` | `/api/find-roll` | Lookup student roll numbers by name, college, and branch. | Public, 200 OK |
| `GET`, `POST` | `/api/dob` | Date of birth discovery and verification engine. | Protected / Whitelisted |
| `GET` | `/api/colleges` | Retrieve the full index of 865+ affiliated colleges. | Cached (Edge 24h) |
| `GET` | `/api/branches` | Retrieve the list of 143+ engineering/management branches. | Cached (Edge 24h) |
| `GET` | `/api/counter` | Live counter of total searches performed on the portal. | No-cache |
| `GET` | `/api/recent-searches`| Real-time stream of recent searches (anonymized names). | Redis backed |

---

## 🤖 Agent-to-Agent (A2A) Interface (`/a2a`)

To support emerging autonomous AI agents (such as Google Agent Payments Protocol `AP2`, MCP, and agent discovery), `akturesult.bond` serves machine-readable declarations:

### 1. Agent Discovery Card
* **URL**: `https://akturesult.bond/.well-known/agent-card.json`
* **Purpose**: Declares agent capabilities, payment protocol extensions, and skill identifiers (`query-result`, `query-colleges`).

### 2. A2A Communication Endpoint (`/a2a`)
Agents can query the `/a2a` endpoint directly:

#### Request (POST):
```json
{
  "protocol": "a2a",
  "rollNumber": "2100970100001"
}
```

#### Response (200 OK):
```json
{
  "success": true,
  "protocol": "a2a",
  "data": {
    "name": "STUDENT NAME",
    "rollNumber": "2100970100001",
    "course": "B.Tech (Computer Science & Engineering)",
    "institute": "GALGOTIAS COLLEGE OF ENGINEERING AND TECHNOLOGY",
    "cgpa": "8.42",
    "divisionAwarded": "FIRST CLASS WITH DISTINCTION"
  }
}
```

---

## 📋 RFC 9727 API Catalog

* **Catalog URL**: `https://akturesult.bond/.well-known/api-catalog`
* **OpenAPI 3.0 Spec**: `https://akturesult.bond/openapi.json`
* **Format**: Conforms to IETF RFC 9727 for programmatic service discovery.
