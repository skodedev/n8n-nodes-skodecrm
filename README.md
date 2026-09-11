# n8n-nodes-skodecrm

An [n8n](https://n8n.io) community node for **[Skode CRM](https://skode.ai)**. Create, update
and search leads, and trigger workflows on lead events.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) ·
[Trigger](#trigger) · [Development](#development) · [Publishing](#publishing)

## Installation

Follow the n8n [community node installation](https://docs.n8n.io/integrations/community-nodes/installation/)
guide. In n8n: **Settings → Community Nodes → Install**, enter `n8n-nodes-skodecrm`.

## Credentials

This node authenticates with **OAuth2** against your Skode CRM — the same OAuth server the Skode
Zapier integration uses.

**CRM admin, one-time:** register an OAuth application for n8n in the CRM and note the **client ID**
and **client secret**. Add n8n's redirect URL to the app's allowed redirect URIs:

- n8n Cloud: `https://oauth.n8n.cloud/oauth2/callback`
- self-hosted: `https://<your-n8n-host>/rest/oauth2-credential/callback`

**In n8n**, create a *Skode CRM OAuth2 API* credential:

| Field | Value |
| --- | --- |
| CRM Base URL | your CRM origin, e.g. `https://crmserver.skode.ai` (no trailing slash) |
| Client ID | from the CRM OAuth app |
| Client Secret | from the CRM OAuth app |

Authorize URL (`/oauth/authorize/`) and token URL (`/oauth/token/`) are derived from the base URL
automatically. Click **Connect** and approve.

This node uses the CRM's **partner integration API** (`/api/partner/v1/…`) — a surface shared by
automation platforms, separate from the Zapier one, with its own rate limits and its own
attribution (your n8n traffic is reported as n8n, not Zapier).

## Operations

**Lead**

- **Create** — `POST /api/partner/v1/leads/`. Org duplicate-detection rules apply. Set
  Email plus any fields under *Additional Fields* (including custom fields via the JSON field).
- **Update** — `PATCH /api/partner/v1/leads/<id>/`.
- **Get Many** — `GET /api/partner/v1/leads/` (with a limit, or return all).
- **Search** — `GET /api/partner/v1/leads/search/?q=…`.

Field keys match your org's schema. Use the CRM's *fields* endpoint
(`/api/partner/v1/leads/fields/`) to see exact keys, including custom fields.

## Trigger

**Skode CRM Trigger** fires on a lead event (created / updated / status changed). It registers
n8n's webhook URL with the CRM (`POST /api/partner/v1/hooks/`) when the workflow activates and
removes it on deactivate — no polling.

## Development

```bash
npm install
npm run build      # tsc + copy icons into dist/
npm run dev        # tsc --watch
npm run lint       # n8n-nodes-base lint rules
```

Link into a local n8n to test against your **test org** (never a live org).

## Publishing

Verified n8n nodes must be published from CI with an npm **provenance** statement (n8n rule from
1 May 2026 — local publishes are rejected). This repo ships
[`.github/workflows/publish.yml`](.github/workflows/publish.yml):

1. Add an `NPM_TOKEN` automation token as a repo Actions secret.
2. `npm version patch && git push --follow-tags` → CI builds, lints and publishes with provenance.
3. Submit the package at the [n8n Creator Portal](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/)
   for verification and marketplace listing.

## License

[MIT](LICENSE) © Skode Technologies Pvt Ltd
