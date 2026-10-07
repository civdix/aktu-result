import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import { DatabaseService } from '../database/database.service';

export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt?: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'push_subscriptions.json');

const DEFAULT_SUBJECT = 'mailto:support@akturesult.bond';

export class PushNotificationService {
  private static isConfigured = false;

  private static configureWebPush(): boolean {
    if (this.isConfigured) return true;

    const publicKey = (typeof process !== 'undefined' && process.env?.VAPID_PUBLIC_KEY) || (import.meta as any).env?.VAPID_PUBLIC_KEY || '';
    const privateKey = (typeof process !== 'undefined' && process.env?.VAPID_PRIVATE_KEY) || (import.meta as any).env?.VAPID_PRIVATE_KEY || '';
    const subject = (typeof process !== 'undefined' && process.env?.VAPID_SUBJECT) || (import.meta as any).env?.VAPID_SUBJECT || DEFAULT_SUBJECT;

    if (!publicKey || !privateKey) {
      console.warn('[PushNotification] VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY missing in environment variables. Web push disabled.');
      return false;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.isConfigured = true;
      return true;
    } catch (err: any) {
      console.warn('[PushNotification] Failed to set VAPID details:', err.message);
      return false;
    }
  }

  public static getPublicKey(): string {
    return (typeof process !== 'undefined' && process.env?.VAPID_PUBLIC_KEY) || (import.meta as any).env?.VAPID_PUBLIC_KEY || '';
  }

  private static ensureDataDir(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (err) {
      console.warn('[PushNotification] Failed to ensure data directory:', err);
    }
  }

  /**
   * Save a new browser push subscription
   */
  public static async saveSubscription(sub: WebPushSubscription): Promise<boolean> {
    if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return false;
    }

    const record: WebPushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth
      },
      userAgent: sub.userAgent || '',
      createdAt: new Date().toISOString()
    };

    // 1. Save to MongoDB
    try {
      const db = await DatabaseService.connectToDatabase();
      if (db) {
        await db.collection('push_subscriptions').updateOne(
          { endpoint: record.endpoint },
          { $set: record },
          { upsert: true }
        );
      }
    } catch (err) {
      console.warn('[PushNotification] DB save failed, saving locally:', err);
    }

    // 2. Backup to local JSON file
    try {
      this.ensureDataDir();
      let subscriptions: WebPushSubscription[] = [];
      if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
        try {
          const raw = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf-8');
          subscriptions = JSON.parse(raw);
        } catch {
          subscriptions = [];
        }
      }

      const existingIdx = subscriptions.findIndex(s => s.endpoint === record.endpoint);
      if (existingIdx !== -1) {
        subscriptions[existingIdx] = record;
      } else {
        subscriptions.push(record);
      }

      fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2), 'utf-8');
    } catch (fsErr) {
      console.warn('[PushNotification] File backup failed:', fsErr);
    }

    return true;
  }

  /**
   * Remove an unsubscribed or dead push subscription
   */
  public static async removeSubscription(endpoint: string): Promise<void> {
    if (!endpoint) return;

    // 1. Delete from MongoDB
    try {
      const db = await DatabaseService.connectToDatabase();
      if (db) {
        await db.collection('push_subscriptions').deleteOne({ endpoint });
      }
    } catch {}

    // 2. Delete from local JSON file
    try {
      if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
        const raw = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf-8');
        const list: WebPushSubscription[] = JSON.parse(raw);
        const filtered = list.filter(s => s.endpoint !== endpoint);
        fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
      }
    } catch {}
  }

  /**
   * Retrieve all active push subscribers
   */
  public static async getAllSubscriptions(): Promise<WebPushSubscription[]> {
    // 1. Try DB first
    try {
      const db = await DatabaseService.connectToDatabase();
      if (db) {
        const subs = await db.collection<WebPushSubscription>('push_subscriptions').find({}).toArray();
        if (subs && subs.length > 0) return subs;
      }
    } catch {}

    // 2. Fallback to local file
    try {
      if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
        const raw = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {}

    return [];
  }

  /**
   * Broadcast a notification for a newly published article to all subscribers.
   * Completely free: uses Chrome/Firefox/Edge native push services without intermediate paid brokers.
   */
  public static async broadcastNewArticle(article: {
    title: string;
    excerpt: string;
    slug: string;
    category?: string;
  }): Promise<{ sent: number; failed: number; cleaned: number }> {
    const isConfigured = this.configureWebPush();
    if (!isConfigured) {
      return { sent: 0, failed: 0, cleaned: 0 };
    }

    const subs = await this.getAllSubscriptions();
    if (subs.length === 0) {
      console.log('[PushNotification] No active push subscribers found to broadcast to.');
      return { sent: 0, failed: 0, cleaned: 0 };
    }

    const payload = JSON.stringify({
      title: `AKTU Update: ${article.title.slice(0, 65)}`,
      body: article.excerpt ? article.excerpt.slice(0, 140) + '...' : 'New AKTU university update published. Tap to read.',
      url: `/news/${article.slug}`,
      icon: '/favicon-96x96.png',
      badge: '/favicon-48x48.png',
      tag: `aktu-${article.slug}`
    });

    let sent = 0;
    let failed = 0;
    let cleaned = 0;

    const dispatchPromises = subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys
          },
          payload,
          {
            TTL: 86400, // 24 hours queue time in browser push server
            urgency: 'high'
          }
        );
        sent++;
      } catch (err: any) {
        failed++;
        // If subscription is expired or cancelled by browser (404 or 410 Gone)
        if (err.statusCode === 404 || err.statusCode === 410) {
          cleaned++;
          await this.removeSubscription(sub.endpoint);
        }
      }
    });

    await Promise.allSettled(dispatchPromises);
    console.log(`[PushNotification] Broadcast complete: ${sent} sent, ${failed} failed (${cleaned} dead removed).`);
    return { sent, failed, cleaned };
  }
}
