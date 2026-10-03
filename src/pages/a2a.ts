import type { APIRoute } from 'astro';
import { AktuEngineService } from '../services/engine.service';

export const prerender = false;

const A2A_METADATA = {
  protocol: 'a2a',
  version: '1.0.0',
  name: 'AKTU Result A2A Agent Interface',
  status: 'active',
  supportedTransports: ['https'],
  supportedMethods: ['query-result', 'query-colleges'],
  endpoint: 'https://akturesult.bond/a2a',
  agentCard: 'https://akturesult.bond/.well-known/agent-card.json'
};

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'public, max-age=3600'
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(A2A_METADATA, null, 2), {
    status: 200,
    headers: JSON_HEADERS
  });
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const rollNumber = body?.rollNumber || body?.params?.rollNumber || body?.query?.rollNumber;

    if (rollNumber) {
      const result = await AktuEngineService.fetchStudentResultDirect(rollNumber);
      return new Response(
        JSON.stringify({
          success: !!result,
          protocol: 'a2a',
          data: result || null
        }),
        { status: 200, headers: JSON_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        protocol: 'a2a',
        message: 'A2A Agent ready. Provide rollNumber to query academic result records.',
        schema: A2A_METADATA
      }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Agent query error' }),
      { status: 200, headers: JSON_HEADERS }
    );
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
};
