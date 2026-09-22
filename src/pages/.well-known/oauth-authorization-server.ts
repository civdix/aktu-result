import type { APIRoute } from 'astro';

export const prerender = false;

const data = {
  issuer: 'https://akturesult.bond',
  authorization_endpoint: 'https://akturesult.bond/oauth/authorize',
  token_endpoint: 'https://akturesult.bond/oauth/token',
  jwks_uri: 'https://akturesult.bond/.well-known/jwks.json',
  registration_endpoint: 'https://akturesult.bond/agent/register',
  scopes_supported: ['read:results', 'read:colleges', 'openid', 'profile'],
  response_types_supported: ['code', 'token', 'id_token'],
  grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
  token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'private_key_jwt'],
  agent_auth: {
    skill: 'https://akturesult.bond/.well-known/agent-skills/index.json',
    register_uri: 'https://akturesult.bond/agent/register',
    identity_types_supported: ['anonymous', 'identity_assertion'],
    anonymous: {
      credential_types_supported: ['api_key'],
      claim_uri: 'https://akturesult.bond/agent/claim'
    },
    identity_assertion: {
      assertion_types_supported: ['urn:ietf:params:oauth:token-type:id-jag', 'verified_email'],
      credential_types_supported: ['oauth_client']
    }
  }
};

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400'
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(data, null, 2), { status: 200, headers });
};

export const HEAD: APIRoute = async () => {
  return new Response(null, { status: 200, headers });
};
