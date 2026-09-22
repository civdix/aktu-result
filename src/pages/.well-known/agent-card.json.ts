import type { APIRoute } from 'astro';

export const prerender = false;

const agentCard = {
  name: 'AKTU Result & Academic Assistant Agent',
  version: '1.0.0',
  description: 'Autonomous AI Agent for querying AKTU examination results, marksheet verification, and college directory discovery.',
  provider: {
    name: 'AKTU Result',
    url: 'https://akturesult.bond'
  },
  supportedInterfaces: [
    {
      url: 'https://akturesult.bond/a2a',
      serviceUrl: 'https://akturesult.bond/a2a',
      protocolBinding: 'HTTP+JSON',
      transport: 'https'
    },
    {
      url: 'https://akturesult.bond/api/search',
      serviceUrl: 'https://akturesult.bond/api/search',
      protocolBinding: 'HTTP+JSON',
      transport: 'http'
    }
  ],
  capabilities: {
    streaming: false,
    tools: true,
    pushNotifications: false,
    extensions: [
      {
        uri: 'https://ap2-protocol.org/',
        required: false,
        role: 'credentials-provider',
        description: 'AP2 agent payments and credentials verification protocol.'
      }
    ]
  },
  skills: [
    {
      id: 'query-result',
      name: 'Academic Result Query',
      description: 'Fetches verified AKTU university semester marksheet and division by student roll number.'
    },
    {
      id: 'query-colleges',
      name: 'College Directory Search',
      description: 'Searches affiliated engineering and management colleges and department branch rosters.'
    }
  ],
  extensions: [
    {
      uri: 'https://ap2-protocol.org/',
      required: false,
      role: 'credentials-provider',
      description: 'AP2 agent payments and credentials verification protocol.'
    }
  ]
};

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400'
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(agentCard, null, 2), { status: 200, headers });
};

export const HEAD: APIRoute = async () => {
  return new Response(null, { status: 200, headers });
};
