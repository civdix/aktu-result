import type { APIRoute } from 'astro';
import { DatabaseService } from '../../database/database.service';
import { ScrapingService } from '../../scraping/scraping.service';
import { DateUtils } from '../../utils/date.utils';
import type { Student, ScrapingSession } from '../../interfaces';

export const prerender = false;

// Client validation helper
function getClientIpAndDomain(request: Request) {
  const ipHeaders = ['x-forwarded-for', 'x-real-ip'];
  let ip = 'unknown';
  for (const header of ipHeaders) {
    const value = request.headers.get(header);
    if (value) {
      ip = value.split(',')[0].trim();
      break;
    }
  }
  const referer = request.headers.get('referer') || '';
  const origin = request.headers.get('origin') || '';
  return { ip, referer, origin };
}

function isAllowed(ip: string, referer: string, origin: string) {
  const allowedHostsStr = process.env.ALLOWED_HOSTS || '';
  const allowedDomainsStr = process.env.ALLOWED_DOMAINS || '';

  // If both configurations are empty, allow access from anywhere
  if (!allowedHostsStr && !allowedDomainsStr) {
    return true;
  }

  if (allowedHostsStr) {
    const hosts = allowedHostsStr.split(',').map(h => h.trim());
    if (hosts.includes(ip) || hosts.includes('*')) {
      return true;
    }
  }

  if (allowedDomainsStr) {
    const domains = allowedDomainsStr.split(',').map(d => d.trim().toLowerCase());
    const refDomain = referer ? new URL(referer).hostname.toLowerCase() : '';
    const origDomain = origin ? new URL(origin).hostname.toLowerCase() : '';
    if (domains.includes(refDomain) || domains.includes(origDomain) || domains.includes('*')) {
      return true;
    }
  }

  return false;
}

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      success: false,
      error: "Method Not Allowed. Please send a POST request with a rollNumber parameter in the JSON body.",
      code: 405
    }),
    {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};

export const POST: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      success: false,
      error: "The automated Date of Birth scanner is currently under maintenance. We are updating our session authentication modules. Please try again later.",
      code: 503
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};

