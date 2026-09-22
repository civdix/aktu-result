import type { APIRoute } from 'astro';

export const prerender = false;

const ucp = {
  ucp: {
    version: '2026-04-08',
    services: {
      'dev.ucp.shopping': {
        version: '2026-04-08',
        rest: {
          endpoint: 'https://akturesult.bond/api'
        }
      }
    },
    capabilities: [
      {
        version: '2026-04-08',
        spec: 'https://ucp.dev/2026-04-08/specification/shopping/checkout'
      }
    ]
  },
  protocol_version: '1.0.0',
  services: [
    {
      name: 'result_service',
      version: '1.0.0',
      description: 'AKTU Academic Result Verification & Query Service'
    }
  ],
  capabilities: [
    'content_delivery',
    'query',
    'student_verification'
  ],
  endpoints: {
    content: 'https://akturesult.bond/api/search',
    status: 'https://akturesult.bond/api/app-status'
  }
};

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400'
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(ucp, null, 2), { status: 200, headers });
};

export const HEAD: APIRoute = async () => {
  return new Response(null, { status: 200, headers });
};
