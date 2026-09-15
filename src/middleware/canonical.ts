import { defineMiddleware } from 'astro:middleware';

/**
 * Canonical SEO Redirect Middleware
 * Automatically performs an HTTP 301 Permanent Redirect:
 * 1. From www.* to apex domain (e.g. www.akturesult.bond -> https://akturesult.bond)
 * 2. From http:// to https://
 * to prevent duplicate content indexing and consolidate search engine rankings.
 */
export const canonicalRedirectMiddleware = defineMiddleware(async (context, next) => {
  const rawHost = context.request.headers.get('x-forwarded-host') 
    || context.request.headers.get('host') 
    || context.url.hostname;

  // Skip local development
  if (!rawHost || rawHost.includes('localhost') || rawHost.includes('127.0.0.1') || rawHost.startsWith('0.0.0.0')) {
    return next();
  }

  const hostWithoutPort = rawHost.split(':')[0].toLowerCase();
  const isWww = hostWithoutPort.startsWith('www.');
  const proto = (context.request.headers.get('x-forwarded-proto') || context.url.protocol.replace(':', '')).toLowerCase();
  const isHttp = proto === 'http';

  if (isWww || isHttp) {
    const cleanHost = hostWithoutPort.replace(/^www\./, '');
    const targetUrl = `https://${cleanHost}${context.url.pathname}${context.url.search}`;
    
    // Avoid self-redirect loops
    if (context.url.href !== targetUrl) {
      return context.redirect(targetUrl, 301);
    }
  }

  return next();
});
