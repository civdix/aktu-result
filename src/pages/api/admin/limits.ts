import type { APIRoute } from 'astro';
import { redisService } from '../../../services/redis.service';
import { verifyAdminRequest, getAdminToken } from '../../../utils/admin-auth';

export const prerender = false;

const ANTI_CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Pragma': 'no-cache',
  'Expires': '0'
};

function checkAuthorization(request: Request, cookies: any): boolean {
  if (verifyAdminRequest(request)) return true;
  const cookieToken = cookies.get('aktu_admin_token')?.value;
  return Boolean(cookieToken && cookieToken === getAdminToken());
}

export const GET: APIRoute = async ({ request, cookies, url }) => {
  if (!checkAuthorization(request, cookies)) {
    return new Response(
      JSON.stringify({ success: false, message: 'Unauthorized: Admin access required.' }),
      { status: 401, headers: ANTI_CACHE_HEADERS }
    );
  }

  try {
    const dateStr = url.searchParams.get('date') || undefined;
    const policy = redisService.getDailyFetchPolicy();
    const { records, isRedisConnected } = await redisService.getAllDailyFetchLimits(dateStr);

    const totalTracked = records.length;
    const totalBlocked = records.filter(r => r.isBlocked).length;
    const totalHighUsage = records.filter(r => r.count >= 3 && !r.isBlocked).length;
    const totalNormal = records.filter(r => r.count < 3).length;
    const totalLookups = records.reduce((sum, r) => sum + r.count, 0);

    return new Response(
      JSON.stringify({
        success: true,
        policy,
        isRedisConnected,
        stats: {
          totalTracked,
          totalBlocked,
          totalHighUsage,
          totalNormal,
          totalLookups
        },
        users: records,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: ANTI_CACHE_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to retrieve user limits telemetry',
        error: error.message
      }),
      { status: 500, headers: ANTI_CACHE_HEADERS }
    );
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!checkAuthorization(request, cookies)) {
    return new Response(
      JSON.stringify({ success: false, message: 'Unauthorized: Admin access required.' }),
      { status: 401, headers: ANTI_CACHE_HEADERS }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action || '';

    if (action === 'reset') {
      const identifier = (body?.identifier || '').trim();
      if (!identifier) {
        return new Response(
          JSON.stringify({ success: false, message: 'Missing identifier to reset' }),
          { status: 400, headers: ANTI_CACHE_HEADERS }
        );
      }

      await redisService.resetDailyFetchLimit(identifier);
      return new Response(
        JSON.stringify({
          success: true,
          message: `Daily limit reset successfully for ${identifier}. User can now search again.`,
          identifier
        }),
        { status: 200, headers: ANTI_CACHE_HEADERS }
      );
    }

    if (action === 'simulate_test') {
      const testIp = body?.identifier || `192.168.1.${Math.floor(Math.random() * 200) + 10}`;
      const count = typeof body?.count === 'number' ? body.count : 5;
      await redisService.setTestDailyFetchLimit(testIp, count);
      return new Response(
        JSON.stringify({
          success: true,
          message: `Simulated limit record added for ${testIp} with count ${count}.`,
          identifier: testIp,
          count
        }),
        { status: 200, headers: ANTI_CACHE_HEADERS }
      );
    }

    if (action === 'reset_all') {
      const { records } = await redisService.getAllDailyFetchLimits();
      for (const r of records) {
        await redisService.resetDailyFetchLimit(r.identifier);
      }
      return new Response(
        JSON.stringify({
          success: true,
          message: `Cleared daily limits for all ${records.length} tracked users.`
        }),
        { status: 200, headers: ANTI_CACHE_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: `Unknown action: "${action}"` }),
      { status: 400, headers: ANTI_CACHE_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to process admin limits operation',
        error: error.message
      }),
      { status: 500, headers: ANTI_CACHE_HEADERS }
    );
  }
};
