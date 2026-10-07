import type { APIRoute } from 'astro';
import { PushNotificationService } from '../../../services/push-notification.service';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { subscription } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid push subscription payload'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userAgent = request.headers.get('user-agent') || '';
    const saved = await PushNotificationService.saveSubscription({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      },
      userAgent
    });

    return new Response(
      JSON.stringify({
        success: saved,
        message: saved ? 'Successfully subscribed to AKTU news alerts' : 'Failed to save subscription'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || 'Error processing subscription'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
