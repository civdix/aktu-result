import type { APIRoute } from 'astro';
import { PushNotificationService } from '../../../services/push-notification.service';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint) {
      return new Response(
        JSON.stringify({ success: false, error: 'Endpoint is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    await PushNotificationService.removeSubscription(endpoint);

    return new Response(
      JSON.stringify({ success: true, message: 'Successfully unsubscribed' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error processing unsubscribe' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
