import type { APIRoute } from 'astro';

export const prerender = false;

const serverCard = {
  serverInfo: {
    name: 'akturesult-mcp-server',
    version: '1.0.0',
    description: 'Model Context Protocol (MCP) server for AKTU Result student academic verification.'
  },
  endpoint: 'https://akturesult.bond/mcp',
  transport: {
    type: 'http-sse',
    endpoint: 'https://akturesult.bond/mcp'
  },
  capabilities: {
    tools: {
      listChanged: false
    },
    resources: {
      subscribe: false,
      listChanged: false
    },
    prompts: {
      listChanged: false
    }
  }
};

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400'
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(serverCard, null, 2), { status: 200, headers });
};

export const HEAD: APIRoute = async () => {
  return new Response(null, { status: 200, headers });
};
