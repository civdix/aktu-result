import type { APIRoute } from 'astro';

export const prerender = false;

const acp = {
  protocol: {
    name: 'acp',
    version: '1.0.0'
  },
  api_base_url: 'https://akturesult.bond/api',
  transports: ['http', 'sse'],
  capabilities: {
    services: [
      'student_verification',
      'academic_result_query',
      'college_directory_search'
    ]
  }
};

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400'
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(acp, null, 2), { status: 200, headers });
};

export const HEAD: APIRoute = async () => {
  return new Response(null, { status: 200, headers });
};
