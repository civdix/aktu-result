import type { APIRoute } from 'astro';
import { CommentService } from '../../../services/comment.service';

export const prerender = false;

// Simple in-memory sliding window rate limiter (max 6 comments per minute per IP)
const ipRateMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 6;

  const timestamps = (ipRateMap.get(ip) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    return true;
  }
  timestamps.push(now);
  ipRateMap.set(ip, timestamps);
  return false;
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const targetId = url.searchParams.get('targetId');
    if (!targetId) {
      return new Response(
        JSON.stringify({ success: false, error: 'targetId query parameter is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const comments = await CommentService.getComments(targetId);

    return new Response(
      JSON.stringify({
        success: true,
        comments,
        meta: {
          ttlDays: 60,
          notice: 'Comments automatically expire and purge after 60 days.',
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=10, s-maxage=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error: any) {
    console.error('Error fetching comments:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to retrieve comments' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const clientIp = clientAddress || 'unknown';
    if (isRateLimited(clientIp)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'You are submitting comments too quickly. Please wait a minute before posting again.',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { targetId, author, content, college } = body || {};

    if (!targetId || typeof targetId !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Target identifier is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!content || typeof content !== 'string' || content.trim().length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: 'Comment must be at least 2 characters long' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (content.trim().length > 800) {
      return new Response(
        JSON.stringify({ success: false, error: 'Comment cannot exceed 800 characters' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const savedComment = await CommentService.addComment({
      targetId: targetId.trim(),
      author: (author && typeof author === 'string' && author.trim()) ? author.trim() : 'AKTU Student',
      content: content.trim(),
      college: college && typeof college === 'string' ? college.trim() : undefined,
    });

    return new Response(
      JSON.stringify({
        success: true,
        comment: savedComment,
        message: 'Comment posted successfully. It will automatically expire after 60 days.',
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error adding comment:', error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Failed to submit comment' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
