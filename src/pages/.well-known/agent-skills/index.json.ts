import type { APIRoute } from 'astro';

export const prerender = false;

const discoveryIndex = {
  $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
  skills: [
    {
      name: 'aktu-result-lookup',
      type: 'skill-md',
      description: 'Query and verify AKTU student examination results and marksheet records by roll number.',
      url: 'https://akturesult.bond/.well-known/agent-skills/aktu-result-lookup/SKILL.md',
      digest: 'sha256:76666214d35c452c88c4810046d067e878b2b5dda6d4513d82100c838d4cca15'
    }
  ]
};

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400'
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(discoveryIndex, null, 2), { status: 200, headers });
};

export const HEAD: APIRoute = async () => {
  return new Response(null, { status: 200, headers });
};
