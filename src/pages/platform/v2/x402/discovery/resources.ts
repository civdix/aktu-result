import type { APIRoute } from 'astro';

export const prerender = false;

const discovery = {
  resources: [
    {
      resource: 'https://akturesult.bond/api/search',
      name: 'AKTU Result Search',
      description: 'Query student academic marksheet by roll number',
      payment: {
        amount: '0',
        currency: 'USDC',
        network: 'base',
        recipient: '0x0000000000000000000000000000000000000000'
      }
    }
  ]
};

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400'
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(discovery, null, 2), { status: 200, headers });
};

export const HEAD: APIRoute = async () => {
  return new Response(null, { status: 200, headers });
};
