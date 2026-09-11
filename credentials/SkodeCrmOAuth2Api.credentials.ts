import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * OAuth2 (authorization-code) against Skode CRM — the SAME OAuth server the
 * Skode Zapier integration uses (django-oauth-toolkit):
 *   authorize: <baseUrl>/oauth/authorize/
 *   token:     <baseUrl>/oauth/token/
 *
 * The CRM admin registers an OAuth application for n8n and supplies the
 * client id/secret. The redirect URL n8n shows on this credential must be
 * added to that application's allowed redirect URIs:
 *   n8n Cloud:      https://oauth.n8n.cloud/oauth2/callback
 *   self-hosted:    https://<your-n8n>/rest/oauth2-credential/callback
 */
export class SkodeCrmOAuth2Api implements ICredentialType {
	name = 'skodeCrmOAuth2Api';

	extends = ['oAuth2Api'];

	// Themed variants so the mark reads correctly on light and dark canvases.
	icon = { light: 'file:../nodes/SkodeCrm/skodecrm.light.svg', dark: 'file:../nodes/SkodeCrm/skodecrm.dark.svg' } as const;

	displayName = 'Skode CRM OAuth2 API';

	documentationUrl = 'https://skode.ai';

	properties: INodeProperties[] = [
		{
			displayName: 'CRM Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://crmserver.skode.ai',
			required: true,
			description:
				'Your Skode CRM origin, no trailing slash. Both the API (/api) and OAuth (/oauth) live here.',
		},
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'authorizationCode',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: '={{$self["baseUrl"]}}/oauth/authorize/',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: '={{$self["baseUrl"]}}/oauth/token/',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: 'read write',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			// django-oauth-toolkit accepts the client secret in the POST body.
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
	];
}
