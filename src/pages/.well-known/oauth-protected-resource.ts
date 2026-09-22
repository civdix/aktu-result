import type { APIRoute } from 'astro';

export const prerender = false;

const data = {
  resource: 'https://akturesult.bond',
  authorization_servers: ['https://akturesult.bond'],
  scopes_supported: ['read:results', 'read:colleges', 'openid', 'profile'],
  bearer_methods_supported: ['header'],
  resource_documentation: 'https://akturesult.bond/api'
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
