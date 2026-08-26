import { defineMiddleware } from 'astro:middleware';

export const paginationMiddleware = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  
  // Extract and parse page and limit params
  const pageParam = url.searchParams.get('page');
  const limitParam = url.searchParams.get('limit');
  
  const page = pageParam ? parseInt(pageParam, 10) : 1;
  const limit = limitParam ? parseInt(limitParam, 10) : 10;
  
  // Enforce validation and default limit to 10
  const validPage = isNaN(page) || page < 1 ? 1 : page;
  const validLimit = isNaN(limit) || limit < 1 ? 10 : limit;
  const skip = (validPage - 1) * validLimit;
  
  context.locals.pagination = {
    page: validPage,
    limit: validLimit,
    skip: skip
  };
  
  return next();
});
