import { defineMiddleware } from 'astro:middleware';

export const cacheControlMiddleware = defineMiddleware(async (context, next) => {
  const response = await next();
  const pathname = context.url.pathname;

  // Ensure Content-Type has charset=utf-8 for SEO audit compliance
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('text/html') && !contentType.includes('charset=')) {
    response.headers.set('content-type', `${contentType}; charset=utf-8`);
  }

  // Markdown for Agents (Accept: text/markdown)
  const acceptHeader = context.request.headers.get('accept') || '';
  if (acceptHeader.includes('text/markdown') && (pathname === '/' || contentType?.includes('text/html'))) {
    const mdContent = `# AKTU Result Without Date of Birth

Online examination result verification and marksheet query portal for Dr. A.P.J. Abdul Kalam Technical University (AKTU) students.

## Quick Actions & APIs

- **Check Result**: POST \`https://akturesult.bond/api/search\` with JSON body \`{"rollNumber": "2400650100001"}\`
- **College Directory**: GET \`https://akturesult.bond/api/colleges\`
- **API Catalog (RFC 9727)**: \`https://akturesult.bond/.well-known/api-catalog\`
- **OpenAPI 3.1 Spec**: \`https://akturesult.bond/openapi.json\`
- **Agent Skills**: \`https://akturesult.bond/.well-known/agent-skills/index.json\`
- **MCP Server Card**: \`https://akturesult.bond/.well-known/mcp/server-card.json\`
- **A2A Agent Card**: \`https://akturesult.bond/.well-known/agent-card.json\`
- **Auth.md**: \`https://akturesult.bond/auth.md\`

## About

AKTU Result provides autonomous AI agents, developers, and students instantaneous academic result marksheets, SGPA, CGPA, and university division without requiring or exposing Date of Birth.
`;
    return new Response(mdContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'x-markdown-tokens': '240',
        'Cache-Control': 'public, max-age=120, s-maxage=600, stale-while-revalidate=86400',
        'Link': '</.well-known/api-catalog>; rel="api-catalog"'
      }
    });
  }

  // Advertise RFC 9727 API Catalog via Link header
  const existingLink = response.headers.get('link');
  if (!existingLink) {
    response.headers.set('link', '</.well-known/api-catalog>; rel="api-catalog"');
  } else if (!existingLink.includes('rel="api-catalog"')) {
    response.headers.set('link', `${existingLink}, </.well-known/api-catalog>; rel="api-catalog"`);
  }

  // If response is an error (404, 500, etc.), NEVER cache it at CDN or browser
  if (response.status >= 400) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    response.headers.set('CDN-Cache-Control', 'no-store');
    response.headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  }

  // Admin dashboard and API calls: never cache under any circumstances
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
    response.headers.set('CDN-Cache-Control', 'no-store');
    response.headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  }

  // Static hashed assets (_astro, images, fonts): cache 1 year immutable
  if (
    pathname.startsWith('/_astro/') ||
    pathname.startsWith('/images/') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.woff2')
  ) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return response;
  }

  if (response.headers.has('Cache-Control')) {
    return response;
  }

  // Dynamic API calls: prevent caching
  if (
    pathname.startsWith('/api/search') ||
    pathname.startsWith('/api/dob') ||
    pathname.startsWith('/api/find-roll') ||
    pathname.startsWith('/api/contact') ||
    pathname.startsWith('/api/articles/view') ||
    pathname.startsWith('/api/articles/live') ||
    pathname.startsWith('/api/recent-searches')
  ) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  }

  // Static colleges API: cache 1 hour at CDN edge
  if (pathname.startsWith('/api/colleges') || pathname.startsWith('/api/college')) {
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    return response;
  }

  // HTML content pages:
  // - max-age=0, must-revalidate: browser always revalidates with CDN so users never get stuck with stale HTML
  // - s-maxage=180: CDN caches HTML for 3 minutes for optimal speed & DDoS protection
  // - stale-while-revalidate=300: allows at most 5 minutes background revalidation, avoiding 24h stale desync
  if (
    pathname === '/' ||
    pathname === '/colleges' ||
    pathname.startsWith('/college/') ||
    pathname === '/roll-number-finder' ||
    pathname === '/faq' ||
    pathname === '/about' ||
    pathname === '/how-it-works' ||
    pathname === '/privacy-policy' ||
    pathname === '/terms' ||
    pathname === '/assessment-simulator' ||
    pathname === '/news'
  ) {
    response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate, s-maxage=180, stale-while-revalidate=300');
  }

  return response;
});