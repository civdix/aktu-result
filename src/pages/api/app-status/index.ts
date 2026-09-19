import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  const payload = {
    activeMode: "NORMAL",
    maintenance: {
      enabled: false,
      title: "System Online",
      message: "AKTU Result services are running normally."
    },
    update: {
      enabled: false,
      minVersionCode: 1,
      latestVersionName: "1.0",
      title: "App Up to Date",
      message: "You are running the official AKTU Result Mobile App.",
      updateUrl: "https://akturesult.bond/download-app"
    },
    timestamp: Date.now()
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-app-key, x-device-id',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-app-key, x-device-id',
    }
  });
};
