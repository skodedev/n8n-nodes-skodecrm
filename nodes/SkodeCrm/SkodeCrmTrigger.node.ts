import type {
	IHookFunctions,
	IWebhookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

/**
 * Skode CRM Trigger — fires a workflow when a lead event happens.
 *
 * Uses the CRM's REST-hook endpoints (the same ones the Zapier app uses):
 *   POST   /api/partner/v1/hooks/        { target_url, event }  -> subscription
 *   DELETE /api/partner/v1/hooks/<id>/
 *
 * n8n owns the webhook URL; on activate we subscribe it, on deactivate we
 * remove it. The CRM then POSTs the lead payload to n8n on each event.
 */
export class SkodeCrmTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Skode CRM Trigger',
		name: 'skodeCrmTrigger',
		icon: { light: 'file:skodecrm.light.svg', dark: 'file:skodecrm.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts a workflow on a Skode CRM lead event',
		defaults: {
			name: 'Skode CRM Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'skodeCrmOAuth2Api',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Organization ID',
				name: 'organizationId',
				type: 'string',
				default: '',
				description: 'Which Skode CRM workspace this trigger belongs to. Required only if your account belongs to more than one organization. Sent as X-Skode-Org-ID when registering the webhook.',
			},
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				default: 'lead.created',
				options: [
					{ name: 'Lead Created', value: 'lead.created' },
					{ name: 'Lead Updated', value: 'lead.updated' },
					{ name: 'Lead Status Changed', value: 'lead.status_changed' },
				],
				description:
					'Which CRM event fires this trigger. Exact event keys are defined by the CRM; adjust if your org uses different ones.',
			},
		],
	};

	// n8n calls these to manage the CRM-side subscription lifecycle.
	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				return webhookData.subscriptionId !== undefined;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const event = this.getNodeParameter('event') as string;
				const orgId = (this.getNodeParameter('organizationId', '') as string) || '';
				const credentials = await this.getCredentials('skodeCrmOAuth2Api');
				const baseUrl = (credentials.baseUrl as string).replace(/\/$/, '');

				const headers: Record<string, string> = { 'X-Skode-Partner': 'n8n' };
				if (orgId) headers['X-Skode-Org-Id'] = orgId;

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'skodeCrmOAuth2Api',
					{
						method: 'POST',
						url: `${baseUrl}/api/partner/v1/hooks/`,
						body: { target_url: webhookUrl, event },
						headers,
						json: true,
					},
				);

				const id = (response as { id?: number | string })?.id;
				if (id === undefined) {
					return false;
				}
				const webhookData = this.getWorkflowStaticData('node');
				webhookData.subscriptionId = id;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (webhookData.subscriptionId === undefined) {
					return true;
				}
				const credentials = await this.getCredentials('skodeCrmOAuth2Api');
				const baseUrl = (credentials.baseUrl as string).replace(/\/$/, '');
				try {
					await this.helpers.httpRequestWithAuthentication.call(
						this,
						'skodeCrmOAuth2Api',
						{
							method: 'DELETE',
							url: `${baseUrl}/api/partner/v1/hooks/${webhookData.subscriptionId}/`,
							headers: (() => {
								const h: Record<string, string> = { 'X-Skode-Partner': 'n8n' };
								const orgId = (this.getNodeParameter('organizationId', '') as string) || '';
								if (orgId) h['X-Skode-Org-Id'] = orgId;
								return h;
							})(),
							json: true,
						},
					);
				} catch (error) {
					// A delete that fails because the subscription is already gone
					// is fine, but we must not pretend nothing happened: log it so
					// a genuine failure (auth expired, CRM down) is visible rather
					// than silently leaving a live subscription behind.
					this.logger.warn(
						`Skode CRM Trigger: could not remove webhook subscription ${webhookData.subscriptionId}: ${
							(error as Error)?.message ?? error
						}`,
					);
				}
				delete webhookData.subscriptionId;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData();
		return {
			workflowData: [this.helpers.returnJsonArray(body as never)],
		};
	}
}
