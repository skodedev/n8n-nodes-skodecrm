import type { INodeType, INodeTypeDescription } from 'n8n-workflow';
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
 * Declarative style = no runtime dependencies (a verification requirement):
 * all HTTP is expressed through `routing` and n8n's built-in request helper.
 */
export class SkodeCrm implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Skode CRM',
		name: 'skodeCrm',
		icon: 'file:skodecrm.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create, update and search leads in Skode CRM',
		defaults: {
			name: 'Skode CRM',
		},
		inputs: ['main'],
		outputs: ['main'],
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

			// ── Create / Update fields ─────────────────────────────────────
			{
				displayName: 'Lead ID',
				name: 'leadId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['lead'], operation: ['update'] } },
				description: 'Numeric ID of the lead to update',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@example.com',
				default: '',
				displayOptions: { show: { resource: ['lead'], operation: ['create'] } },
				routing: { send: { type: 'body', property: 'email' } },
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: { resource: ['lead'], operation: ['create', 'update'] },
				},
				description:
					'Any CRM lead field. Use "Get fields" in the CRM (or the fields endpoint) to see the exact keys your org accepts, including custom fields.',
				options: [
					{
						displayName: 'Company',
						name: 'company',
						type: 'string',
						default: '',
						routing: { send: { type: 'body', property: 'company' } },
					},
					{
						displayName: 'Contact Name',
						name: 'contact_name',
						type: 'string',
						default: '',
						routing: { send: { type: 'body', property: 'contact_name' } },
					},
					{
						displayName: 'Custom Fields (JSON)',
						name: 'customFieldsJson',
						type: 'json',
						default: '{}',
						description:
							'Any additional field keys as a JSON object, merged into the request body',
						routing: { send: { type: 'body', value: '={{ JSON.parse($value || "{}") }}' } },
					},
					{
						displayName: 'First Name',
						name: 'first_name',
						type: 'string',
						default: '',
						routing: { send: { type: 'body', property: 'first_name' } },
					},
					{
						displayName: 'Last Name',
						name: 'last_name',
						type: 'string',
						default: '',
						routing: { send: { type: 'body', property: 'last_name' } },
					},
					{
						displayName: 'Phone',
						name: 'phone',
						type: 'string',
						default: '',
						routing: { send: { type: 'body', property: 'phone' } },
					},
					{
						displayName: 'Project',
						name: 'projects',
						type: 'string',
						default: '',
						description: 'Project name (created if it does not exist)',
						routing: { send: { type: 'body', property: 'projects' } },
					},
					{
						displayName: 'Source',
						name: 'lead_source',
						type: 'string',
						default: '',
						routing: { send: { type: 'body', property: 'lead_source' } },
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'string',
						default: '',
						routing: { send: { type: 'body', property: 'status' } },
					},
				],
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
}
