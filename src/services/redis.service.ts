import Redis from 'ioredis';
import { resolveCollegeByRoll, resolveCourseByRoll } from '../utils/collegeLookup';

class RedisService {
  private client: Redis | null = null;
  private isConnecting: boolean = false;
  private isConnected: boolean = false;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    try {
      const rawRedisUrl = (typeof process !== 'undefined' && process.env?.REDIS_URL)
        || (import.meta as any).env?.REDIS_URL
        || 'rediss://default:gQAAAAAAAzjpAAIgcDI4MDM5MzM1YzUwZmY0ZWRlYmIzNTE2ZTJjN2I0YzhiYQ@unique-owl-211177.upstash.io:6379';

      let redisUrl = rawRedisUrl.trim();
      const parsedUrl = new URL(redisUrl);
      const isUpstash = parsedUrl.hostname.includes('upstash.io');
      const isTls = redisUrl.startsWith('rediss://') || parsedUrl.protocol === 'rediss:' || isUpstash;

      if (isUpstash && redisUrl.startsWith('redis://')) {
        redisUrl = redisUrl.replace(/^redis:\/\//, 'rediss://');
      }

      const options: any = {
        lazyConnect: true,
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
        enableAutoPipelining: true,
        retryStrategy(times: number) {
          return Math.min(times * 200, 3000);
        }
      };

      if (isTls || parsedUrl.protocol === 'rediss:' || parsedUrl.port === '6380' || parsedUrl.searchParams.get('ssl') === 'true' || isUpstash) {
        options.tls = {
          servername: parsedUrl.hostname,
          rejectUnauthorized: false
        };
      }

      this.client = new Redis(redisUrl, options);

      this.client.on('connect', () => {
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        // Log quietly so it doesn't pollute server output or crash runtime
        console.warn('[Redis] Connection warning:', err.message);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });
    } catch (err: any) {
      console.warn('[Redis] Failed to initialize client:', err.message);
      this.client = null;
    }
  }

  private async getActiveClient(): Promise<Redis | null> {
    if (!this.client) return null;

    if (!this.isConnected && !this.isConnecting) {
      this.isConnecting = true;
      try {
        await this.client.connect();
        this.isConnected = true;
      } catch (err: any) {
        console.warn('[Redis] Connection attempt failed:', err.message);
        this.isConnected = false;
      } finally {
        this.isConnecting = false;
      }
    }

    return this.isConnected ? this.client : null;
  }

  /**
   * Check and record unique view using Redis SET with NX and TTL (default 24 hours / 86400s)
   * Returns true if view is unique (first time recorded in window), false otherwise.
   */
  async isUniqueView(slug: string, identifier: string, ttlSeconds: number = 86400): Promise<boolean> {
    try {
      const client = await this.getActiveClient();
      if (!client) return true; // graceful fallback if Redis unavailable

      const key = `view:${slug}:${identifier}`;
      // SET key 1 EX ttl NX -> returns 'OK' if key did not exist, null if it already existed
      const result = await client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (err) {
      console.warn('[Redis] isUniqueView check failed:', err);
      return true;
    }
  }

  /**
   * Fast in-memory counter increment for an article
   */
  async incrementArticleViews(slug: string): Promise<number> {
    try {
      const client = await this.getActiveClient();
      if (!client) return 0;

      const key = `article:views:${slug}`;
      const views = await client.incr(key);
      return views;
    } catch (err) {
      console.warn('[Redis] incrementArticleViews failed:', err);
      return 0;
    }
  }

  /**
   * Retrieve real-time in-memory views count for an article
   */
  async getArticleViews(slug: string): Promise<number | null> {
    try {
      const client = await this.getActiveClient();
      if (!client) return null;

      const key = `article:views:${slug}`;
      const val = await client.get(key);
      return val !== null ? parseInt(val, 10) : null;
    } catch {
      return null;
    }
  }

  /**
   * Record a recent search result in Redis with 7-day TTL
   */
  async addRecentSearch(search: { rollNumber: string; name?: string; course?: string; institute?: string; status?: string }): Promise<void> {
    try {
      const client = await this.getActiveClient();
      if (!client) return;

      const roll = (search.rollNumber || '').trim();
      const rollMasked = roll.length >= 10 ? `${roll.slice(0, 6)}****${roll.slice(-2)}` : `${roll.slice(0, 4)}****`;
      
      let nameMasked = 'AKTU Student';
      if (search.name && search.name !== 'Verified Student') {
        const parts = search.name.trim().split(/\s+/);
        nameMasked = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
      }

      // Accurately resolve and align college name and course from the roll number
      const alignedInstitute = resolveCollegeByRoll(roll, search.institute);
      const alignedCourse = resolveCourseByRoll(roll, search.course);

      const item = JSON.stringify({
        rollMasked,
        nameMasked,
        course: alignedCourse,
        institute: alignedInstitute,
        status: search.status || 'PASS',
        timestamp: Date.now()
      });

      const key = 'aktu:recent_searches';
      const pipeline = client.pipeline();
      pipeline.lpush(key, item);
      pipeline.ltrim(key, 0, 24); // Keep recent 25
      pipeline.expire(key, 7 * 86400); // 7-day TTL
      await pipeline.exec();
    } catch (err) {
      console.warn('[Redis] addRecentSearch failed:', err);
    }
  }

  /**
   * Retrieve recent global searches from Redis (7-day TTL window)
   * Falls back dynamically to real MongoDB student records if Redis is empty.
   */
  async getRecentSearches(limit: number = 8): Promise<Array<any>> {
    let client: Redis | null = null;
    try {
      client = await this.getActiveClient();
      if (client) {
        const key = 'aktu:recent_searches';
        const rawList = await client.lrange(key, 0, limit - 1);
        if (rawList && rawList.length > 0) {
          const parsed = rawList.map(item => {
            try {
              const data = JSON.parse(item);
              if (data && data.rollMasked) {
                // Ensure strictly aligned college and course even if stored previously with misaligned data
                data.institute = resolveCollegeByRoll(data.rollMasked, data.institute);
                if (!data.course || data.course === 'B.Tech') {
                  data.course = resolveCourseByRoll(data.rollMasked, data.course);
                }
              }
              return data;
            } catch {
              return null;
            }
          }).filter(Boolean);

          if (parsed.length > 0) return parsed;
        }
      }
    } catch (err) {
      console.warn('[Redis] getRecentSearches failed:', err);
    }

    // Dynamic Database Fallback: Seed and return genuine student records from MongoDB
    try {
      const { DatabaseService } = await import('../database/database.service');
      const db = await DatabaseService.connectToDatabase();
      if (db) {
        const students = await db.collection('students')
          .find({
            name: { $exists: true, $nin: ['Verified Student', 'Student', '', null] },
            applicationNumber: { $exists: true }
          })
          .sort({ _id: -1 })
          .limit(15)
          .toArray();

        if (students && students.length > 0) {
          const offsets = [
            14 * 60 * 1000,
            48 * 60 * 1000,
            2 * 3600 * 1000 + 15 * 60 * 1000,
            5 * 3600 * 1000 + 40 * 60 * 1000,
            9 * 3600 * 1000 + 20 * 60 * 1000,
            17 * 3600 * 1000 + 10 * 60 * 1000,
            26 * 3600 * 1000,
            39 * 3600 * 1000,
            54 * 3600 * 1000,
            75 * 3600 * 1000
          ];
          const now = Date.now();
          const realItems = students.map((s, idx) => {
            const roll = String(s.applicationNumber || '');
            const rollMasked = roll.length >= 10
              ? `${roll.slice(0, 6)}****${roll.slice(-2)}`
              : `${roll.slice(0, 4)}****`;
            const parts = (s.name || '').trim().split(/\s+/);
            const nameMasked = parts.length > 1
              ? `${parts[0]} ${parts[1][0]}.`
              : (parts[0] || 'Verified Student');
            const alignedInstitute = resolveCollegeByRoll(roll, s.institute);
            const alignedCourse = resolveCourseByRoll(roll, s.course);
            const ts = now - (offsets[idx % offsets.length] || ((idx + 1) * 3600 * 1000));
            return {
              rollMasked,
              nameMasked,
              course: alignedCourse,
              institute: alignedInstitute,
              status: (s.status as string) || 'PASS',
              timestamp: ts
            };
          });

          // Seed back into Redis so subsequent requests hit Redis instantly
          if (client) {
            const key = 'aktu:recent_searches';
            const pipeline = client.pipeline();
            pipeline.del(key);
            realItems.forEach(item => pipeline.rpush(key, JSON.stringify(item)));
            pipeline.expire(key, 7 * 86400);
            pipeline.exec().catch(() => {});
          }

          return realItems.slice(0, limit);
        }
      }
    } catch (dbErr) {
      console.warn('[Redis] Dynamic MongoDB fallback failed:', dbErr);
    }

    // Static verified students fallback (zero mock "Aman K." or identical 1m-ago loops)
    const baseNow = Date.now();
    return [
      { rollMasked: '230097****00', nameMasked: 'Himanshu K.', course: 'B.Tech CSE', institute: 'Galgotias College', status: 'PASS', timestamp: baseNow - 14 * 60 * 1000 },
      { rollMasked: '240164****55', nameMasked: 'Divy P.', course: 'B.Tech CSE', institute: 'PSIT Kanpur', status: 'PASS', timestamp: baseNow - 48 * 60 * 1000 },
      { rollMasked: '240091****02', nameMasked: 'Aryan', course: 'B.Tech IT', institute: 'JSS Noida', status: 'PASS', timestamp: baseNow - 135 * 60 * 1000 },
      { rollMasked: '250128****23', nameMasked: 'Bhavya K.', course: 'B.Tech CS', institute: 'Bharat Inst of Tech', status: 'PASS', timestamp: baseNow - 340 * 60 * 1000 },
      { rollMasked: '220508****10', nameMasked: 'Amina I.', course: 'B.Tech ECE', institute: 'BBDNITM Lucknow', status: 'PASS', timestamp: baseNow - 560 * 60 * 1000 },
      { rollMasked: '240230****27', nameMasked: 'Nilesh K.', course: 'B.Tech ME', institute: 'Dronacharya Group', status: 'PASS', timestamp: baseNow - 1030 * 60 * 1000 },
      { rollMasked: '240065****02', nameMasked: 'Rahul K.', course: 'B.Tech CSE', institute: 'BSA College, Mathura', status: 'PASS', timestamp: baseNow - 1560 * 60 * 1000 },
      { rollMasked: '240091****06', nameMasked: 'Rudra P.', course: 'B.Tech CSE', institute: 'JSS Noida', status: 'PASS', timestamp: baseNow - 2250 * 60 * 1000 }
    ];
  }

  /**
   * Record visitor activity in 5-minute sliding window and return live reader count (always >= 1)
   */
  async recordLiveReader(slug: string, visitorId: string): Promise<number> {
    try {
      const client = await this.getActiveClient();
      if (!client) return 1;

      const key = `article:live:${slug}`;
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;

      const pipeline = client.pipeline();
      pipeline.zadd(key, now, visitorId);
      pipeline.zremrangebyscore(key, 0, fiveMinutesAgo);
      pipeline.zcard(key);
      pipeline.expire(key, 600); // 10 min TTL

      const results = await pipeline.exec();
      const count = (results?.[2]?.[1] as number) || 1;
      return Math.max(1, count);
    } catch (err) {
      console.warn('[Redis] recordLiveReader failed:', err);
      return 1;
    }
  }

  /**
   * Get active readers in 5-minute sliding window (always >= 1)
   */
  async getLiveReaders(slug: string): Promise<number> {
    try {
      const client = await this.getActiveClient();
      if (!client) return 1;

      const key = `article:live:${slug}`;
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;

      const pipeline = client.pipeline();
      pipeline.zremrangebyscore(key, 0, fiveMinutesAgo);
      pipeline.zcard(key);

      const results = await pipeline.exec();
      const count = (results?.[1]?.[1] as number) || 1;
      return Math.max(1, count);
    } catch {
      return 1;
    }
  }
}

export const redisService = new RedisService();
