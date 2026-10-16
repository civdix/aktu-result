import type { APIRoute } from 'astro';
import { CommentService } from '../../../services/comment.service';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { commentId } = await request.json();

    if (!commentId || typeof commentId !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'commentId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const likes = await CommentService.likeComment(commentId);

    return new Response(
      JSON.stringify({ success: true, likes }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to like comment' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
