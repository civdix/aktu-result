import type { APIRoute } from 'astro';

export const prerender = false;

const catalog = {
  linkset: [
    {
      anchor: 'https://akturesult.bond/api',
      'service-desc': [
        {
          href: 'https://akturesult.bond/openapi.json',
          type: 'application/json'
        }
      ],
      'service-doc': [
        {
          href: 'https://akturesult.bond/api',
          type: 'text/html'
        }
      ],
      status: [
        {
          href: 'https://akturesult.bond/api/app-status',
          type: 'application/json'
        }
      ]
    },
    {
      anchor: 'https://akturesult.bond/api/search',
      'service-desc': [
        {
          href: 'https://akturesult.bond/openapi.json',
          type: 'application/json'
        }
      ],
      'service-doc': [
        {
          href: 'https://akturesult.bond/api',
          type: 'text/html'
        }
      ],
      status: [
        {
          href: 'https://akturesult.bond/api/app-status',
          type: 'application/json'
        }
      ]
    }
  ]
};

const headers = {
  'Content-Type': 'application/linkset+json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400',
  'Link': '</.well-known/api-catalog>; rel="api-catalog"'
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(catalog, null, 2), {
    status: 200,
    headers
  });
};

export const HEAD: APIRoute = async () => {
  return new Response(null, {
    status: 200,
    headers
  });
};

export const ALL: APIRoute = async ({ request }) => {
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }
  return new Response(JSON.stringify(catalog, null, 2), {
    status: 200,
    headers
  });
};
