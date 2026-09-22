import type { APIRoute } from 'astro';

export const prerender = false;

const ardManifest = {
  specVersion: '1.0',
  host: {
    domain: 'akturesult.bond',
    name: 'AKTU Result',
    description: 'Dr. A.P.J. Abdul Kalam Technical University Examination Result & Student Verification System'
  },
  entries: [
    {
      id: 'urn:air:akturesult.bond:api:result-search',
      displayName: 'AKTU Result Search API',
      type: 'application/json',
      url: 'https://akturesult.bond/api/search',
      description: 'Fetch student semester results and marksheet by roll number.',
      representativeQueries: [
        'Check AKTU semester result',
        'Find university roll number marksheet',
        'AKTU result without date of birth',
        'Download AKTU result marksheet'
      ]
    },
    {
      id: 'urn:air:akturesult.bond:mcp:server',
      displayName: 'AKTU Result MCP Server',
      type: 'application/json',
      url: 'https://akturesult.bond/mcp',
      description: 'Model Context Protocol (MCP) server for querying AKTU academic data.',
      representativeQueries: [
        'Query student results with AI agent',
        'Search AKTU colleges via MCP tool',
        'Verify technical university student'
      ]
    }
  ]
};

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400'
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(ardManifest, null, 2), { status: 200, headers });
};

export const HEAD: APIRoute = async () => {
  return new Response(null, { status: 200, headers });
};
