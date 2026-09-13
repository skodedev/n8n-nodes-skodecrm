import type {
	INodeType,
	INodeTypeDescription,
	ILoadOptionsFunctions,
	ResourceMapperFields,
	ResourceMapperField,
	INodePropertyOptions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

/**
 * Skode CRM — declarative node.
 *
 * Talks to the CRM's PARTNER integration surface — deliberately NOT the Zapier
 * one, which is owner-locked, shares Zapier's throttle bucket, and stamps every
 * webhook it creates as 'zapier':
 *   POST   /api/partner/v1/leads/
 *   PATCH  /api/partner/v1/leads/<id>/
 *   GET    /api/partner/v1/leads/
 *   GET    /api/partner/v1/leads/search/
 *   GET    /api/partner/v1/leads/fields/
 * Connection test hits GET /api/partner/v1/me/.
 *
 * Fields are NOT hardcoded. Create/Update use an n8n resource mapper that loads
 * the connected organization's real lead schema from /leads/fields/ — so each
 * org sees its own Field Editor fields (labels, required flags, select options,
 * custom fields), exactly as configured in the CRM. See getLeadFields() below.
 */

// The partner /leads/fields/ endpoint returns the same wire types the CRM's
// Zapier surface uses. Map them to n8n resource-mapper column types. Anything
// not listed falls through to 'string', which the CRM accepts for text values.
// A field that carries `choices` becomes an 'options' column regardless of type.
const CRM_TYPE_TO_N8N: Record<string, ResourceMapperField['type']> = {
	string: 'string',
	text: 'string',
	number: 'number',
	boolean: 'boolean',
	datetime: 'dateTime',
	date: 'dateTime',
	// document_url etc. arrive as strings; a file URL is still just a string.
	file: 'string',
};

/** The CRM stores select options as a JSON list of either bare strings or
 *  {value,label}/{value,name} objects. Normalise both to n8n's option shape. */
function normaliseOptions(options: unknown): INodePropertyOptions[] {
	if (!Array.isArray(options)) return [];
	return options.map((o) => {
		if (o && typeof o === 'object') {
			const rec = o as Record<string, unknown>;
			const value = String(rec.value ?? rec.name ?? rec.label ?? '');
			const name = String(rec.label ?? rec.name ?? rec.value ?? value);
			return { name, value };
		}
		return { name: String(o), value: String(o) };
	});
}

export class SkodeCrm implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Skode CRM',
		name: 'skodeCrm',
		icon: { light: 'file:skodecrm.light.svg', dark: 'file:skodecrm.dark.svg' },
		group: ['transform'],
		version: 1,
		// Safe for an AI agent to call: every operation is an explicit,
		// described CRM action against one org, gated by the credential.
		usableAsTool: true,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create, update and search leads in Skode CRM',
		defaults: {
			name: 'Skode CRM',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'skodeCrmOAuth2Api',
				required: true,
			},
		],
		requestDefaults: {
			// baseUrl comes from the credential so one node works across envs.
			baseURL: '={{$credentials.baseUrl}}/api/partner/v1',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				// Declares who is calling so the CRM attributes webhooks and
				// intake logs to n8n instead of lumping them in with Zapier.
				'X-Skode-Partner': 'n8n',
			},
		},
		properties: [
			// NOTE: there is deliberately NO "Organization ID" field. The CRM
			// binds the target workspace to the OAuth token at the consent
			// screen (you pick the org when you click Connect), and the partner
			// API resolves it from that binding server-side.
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Lead', value: 'lead' }],
				default: 'lead',
			},

			// ── Lead operations ────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['lead'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						action: 'Create a lead',
						description: 'Create a lead (org duplicate rules apply)',
						routing: {
							request: { method: 'POST', url: '/leads/' },
						},
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update a lead',
						routing: {
							request: {
								method: 'PATCH',
								url: '=/leads/{{$parameter["leadId"]}}/',
							},
						},
					},
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many leads',
						routing: {
							request: { method: 'GET', url: '/leads/' },
						},
					},
					{
						name: 'Search',
						value: 'search',
						action: 'Search leads',
						routing: {
							request: { method: 'GET', url: '/leads/search/' },
						},
					},
				],
				default: 'create',
			},

			// ── Update: which lead ─────────────────────────────────────────
			{
				displayName: 'Lead ID',
				name: 'leadId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['lead'], operation: ['update'] } },
				description: 'Numeric ID of the lead to update',
			},

			// ── Create / Update fields — loaded from THIS org's Field Editor ──
			{
				displayName: 'Fields',
				name: 'leadFields',
				type: 'resourceMapper',
				noDataExpression: true,
				default: { mappingMode: 'defineBelow', value: null },
				required: true,
				displayOptions: {
					show: { resource: ['lead'], operation: ['create', 'update'] },
				},
				description:
					"The lead's fields, loaded live from your organization's Field Editor — including custom fields",
				typeOptions: {
					loadOptionsDependsOn: ['resource', 'operation'],
					resourceMapper: {
						resourceMapperMethod: 'getLeadFields',
						mode: 'add',
						fieldWords: { singular: 'field', plural: 'fields' },
						// Show ONLY required fields by default; every optional field
						// is added on demand via the "Add field to send" picker.
						addAllFields: false,
						multiKeyMatch: false,
						supportAutoMap: true,
					},
				},
				// The mapped {key: value} object IS the request body for both the
				// POST (create) and PATCH (update). Empty values are omitted by
				// the mapper, so PATCH stays a partial update.
				routing: {
					request: {
						body: '={{ $value.value || {} }}',
					},
				},
			},

			// ── Search / Get Many params ───────────────────────────────────
			{
				displayName: 'Query',
				name: 'q',
				type: 'string',
				default: '',
				displayOptions: { show: { resource: ['lead'], operation: ['search'] } },
				description: 'Search text (name, email, phone)',
				routing: { send: { type: 'query', property: 'q' } },
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['lead'], operation: ['getAll'] } },
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				description: 'Max number of results to return',
				default: 50,
				typeOptions: { minValue: 1 },
				displayOptions: {
					show: { resource: ['lead'], operation: ['getAll'], returnAll: [false] },
				},
				routing: { send: { type: 'query', property: 'page_size' } },
			},
		],
	};

	methods = {
		resourceMapping: {
			// Loads the connected org's lead schema so the mapper shows that
			// org's actual fields. On Update every field is optional (PATCH is
			// partial); on Create the CRM's required flags are honoured.
			async getLeadFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const credentials = await this.getCredentials('skodeCrmOAuth2Api');
				const baseUrl = String(credentials.baseUrl).replace(/\/$/, '');
				const operation = this.getNodeParameter('operation', 0) as string;

				let response: { fields?: Array<Record<string, unknown>> };
				try {
					response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'skodeCrmOAuth2Api',
						{
							method: 'GET',
							url: `${baseUrl}/api/partner/v1/leads/fields/`,
							headers: { 'X-Skode-Partner': 'n8n' },
							json: true,
						},
					);
				} catch {
					// A schema lookup failure must not brick the node — fall back
					// to a free-form mapper so the user can still send raw keys.
					return { fields: [] };
				}

				const raw = Array.isArray(response?.fields) ? response.fields : [];
				const fields: ResourceMapperField[] = [];

				for (const f of raw) {
					const key = String(f.key ?? '');
					if (!key) continue;

					// A field with `choices` (status, priority, team member,
					// country, select) is a dropdown; everything else maps by type.
					const hasChoices = Array.isArray(f.choices) && f.choices.length > 0;
					const type: ResourceMapperField['type'] = hasChoices
						? 'options'
						: CRM_TYPE_TO_N8N[String(f.type ?? 'string')] ?? 'string';

					const column: ResourceMapperField = {
						id: key,
						displayName: String(f.label ?? key),
						required: operation === 'create' ? f.required === true : false,
						defaultMatch: false,
						canBeUsedToMatch: false,
						display: true,
						type,
						readOnly: false,
					};
					if (type === 'options') {
						column.options = normaliseOptions(f.choices);
					}
					fields.push(column);
				}

				return { fields };
			},
		},
	};
}
