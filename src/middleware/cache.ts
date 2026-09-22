import { defineMiddleware } from 'astro:middleware';

export const cacheControlMiddleware = defineMiddleware(async (context, next) => {
  const response = await next();
  const pathname = context.url.pathname;

  // Ensure Content-Type has charset=utf-8 for SEO audit compliance
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('text/html') && !contentType.includes('charset=')) {
    response.headers.set('content-type', `${contentType}; charset=utf-8`);
  }

  // Advertise RFC 9727 API Catalog via Link header
  const existingLink = response.headers.get('link');
  if (!existingLink) {
    response.headers.set('link', '</.well-known/api-catalog>; rel="api-catalog"');
  } else if (!existingLink.includes('rel="api-catalog"')) {
    response.headers.set('link', `${existingLink}, </.well-known/api-catalog>; rel="api-catalog"`);
  }

  if (response.headers.has('Cache-Control')) {
    return response;
  }

  // Dynamic API calls: prevent caching
  if (
    pathname.startsWith('/api/search') ||
    pathname.startsWith('/api/dob') ||
    pathname.startsWith('/api/find-roll') ||
    pathname.startsWith('/api/contact')
  ) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  }

  // Static colleges API: cache 1 hour at CDN edge
  if (pathname.startsWith('/api/colleges') || pathname.startsWith('/api/college')) {
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    return response;
  }

  // HTML content pages: cache 10 min at CDN edge, background revalidate
  if (
    pathname === '/' ||
    pathname === '/colleges' ||
    pathname.startsWith('/college/') ||
    pathname === '/roll-number-finder' ||
    pathname === '/faq' ||
    pathname === '/about' ||
    pathname === '/how-it-works' ||
    pathname === '/privacy-policy' ||
    pathname === '/terms'
  ) {
    response.headers.set('Cache-Control', 'public, max-age=120, s-maxage=600, stale-while-revalidate=86400');
  }

  return response;
});