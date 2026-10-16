import fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import { DatabaseService } from '../database/database.service';
import type { Comment, CommentInput } from '../interfaces/comment.interface';

// 60 days in seconds (5,184,000 seconds) and milliseconds
export const TTL_60_DAYS_SECONDS = 60 * 24 * 60 * 60;
export const TTL_60_DAYS_MS = TTL_60_DAYS_SECONDS * 1000;

const DATA_DIR = path.resolve(process.cwd(), 'data');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('Failed to ensure data directory for comments:', err);
  }
}

function sanitizeText(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

export class CommentService {
  private static indexEnsured = false;

  /**
   * Ensures MongoDB TTL index exists on `createdAt` with 60-day auto-purge.
   * MongoDB automatically deletes expired documents in the background every ~60 seconds.
   */
  static async ensureTtlIndex(): Promise<void> {
    if (this.indexEnsured) return;

    try {
      const db = await DatabaseService.connectToDatabase();
      if (!db) return;

      const collection = db.collection('comments');

      // Create TTL index if not already present
      await collection.createIndex(
        { createdAt: 1 },
        {
          expireAfterSeconds: TTL_60_DAYS_SECONDS,
          name: 'comment_ttl_60_days',
          background: true,
        }
      );
      this.indexEnsured = true;
      console.log('MongoDB comments TTL 60-day index successfully initialized.');
    } catch (err: any) {
      // If index exists with different specs or error occurs, log warning
      console.warn('MongoDB TTL index initialization notice:', err?.message || err);
      this.indexEnsured = true;
    }
  }

  /**
   * Get active comments for a target (e.g., news slug or page identifier).
   * Strict application-level filter guarantees no comment older than 60 days is ever returned.
   */
  static async getComments(targetId: string, limit: number = 50): Promise<Comment[]> {
    await this.ensureTtlIndex();
    const sixtyDaysAgo = new Date(Date.now() - TTL_60_DAYS_MS);

    // 1. Try MongoDB
    try {
      const db = await DatabaseService.connectToDatabase();
      if (db) {
        const collection = db.collection('comments');
        const rawComments = await collection
          .find({
            targetId,
            status: { $ne: 'deleted' },
            createdAt: { $gte: sixtyDaysAgo }, // 60-day active filter
          })
          .sort({ createdAt: -1 })
          .limit(limit)
          .toArray();

        return rawComments.map((c: any) => ({
          _id: c._id ? c._id.toString() : String(Math.random()),
          targetId: c.targetId,
          author: c.author,
          avatarSeed: c.avatarSeed || c.author,
          content: c.content,
          createdAt: new Date(c.createdAt),
          expiresAt: c.expiresAt ? new Date(c.expiresAt) : new Date(new Date(c.createdAt).getTime() + TTL_60_DAYS_MS),
          likes: c.likes || 0,
          college: c.college,
          status: c.status || 'active',
        }));
      }
    } catch (dbErr) {
      console.warn('MongoDB comment fetch failed, falling back to local store:', dbErr);
    }

    // 2. Fallback to local JSON store
    return this.getLocalComments(targetId, limit);
  }

  /**
   * Add a new comment with an exact 60-day expiration stamp.
   */
  static async addComment(input: CommentInput): Promise<Comment | null> {
    await this.ensureTtlIndex();

    const sanitizedAuthor = sanitizeText(input.author || 'AKTU Student').slice(0, 50);
    const sanitizedContent = sanitizeText(input.content || '').slice(0, 800);
    const sanitizedCollege = input.college ? sanitizeText(input.college).slice(0, 100) : undefined;

    if (!sanitizedContent || sanitizedContent.length < 2) {
      throw new Error('Comment content is too short.');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + TTL_60_DAYS_MS);

    const newComment: Comment = {
      targetId: input.targetId,
      author: sanitizedAuthor,
      avatarSeed: sanitizedAuthor + '_' + Math.random().toString(36).substring(2, 6),
      content: sanitizedContent,
      createdAt: now,
      expiresAt: expiresAt,
      likes: 0,
      college: sanitizedCollege,
      status: 'active',
    };

    // 1. Save to MongoDB
    let savedComment = { ...newComment };
    try {
      const db = await DatabaseService.connectToDatabase();
      if (db) {
        const collection = db.collection('comments');
        const result = await collection.insertOne(newComment as any);
        savedComment._id = result.insertedId.toString();
      }
    } catch (dbErr) {
      console.warn('Failed to persist comment to MongoDB, writing to local store:', dbErr);
      savedComment._id = 'local_' + Date.now();
    }

    // 2. Persist to local JSON fallback
    try {
      this.saveLocalComment(savedComment);
    } catch (localErr) {
      console.warn('Failed to sync comment to local JSON backup:', localErr);
    }

    return savedComment;
  }

  /**
   * Upvote a comment
   */
  static async likeComment(commentId: string): Promise<number> {
    try {
      const db = await DatabaseService.connectToDatabase();
      if (db && ObjectId.isValid(commentId)) {
        const collection = db.collection('comments');
        const res = await collection.findOneAndUpdate(
          { _id: new ObjectId(commentId) },
          { $inc: { likes: 1 } },
          { returnDocument: 'after' }
        );
        if (res && (res as any).likes) {
          return (res as any).likes;
        }
      }
    } catch (e) {
      console.warn('Failed to like comment in MongoDB:', e);
    }

    // Fallback in local store
    return this.likeLocalComment(commentId);
  }

  /**
   * Local storage fallback helpers with auto 60-day cleanup
   */
  private static getLocalComments(targetId: string, limit: number): Comment[] {
    ensureDataDir();
    try {
      if (!fs.existsSync(COMMENTS_FILE)) return [];
      const content = fs.readFileSync(COMMENTS_FILE, 'utf-8');
      const all: Comment[] = JSON.parse(content);
      const sixtyDaysAgo = Date.now() - TTL_60_DAYS_MS;

      // Filter by targetId, active status, and strictly within 60 days
      const filtered = all
        .filter(c => c.targetId === targetId && c.status !== 'deleted' && new Date(c.createdAt).getTime() >= sixtyDaysAgo)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);

      return filtered;
    } catch (err) {
      return [];
    }
  }

  private static saveLocalComment(comment: Comment): void {
    ensureDataDir();
    try {
      let list: Comment[] = [];
      if (fs.existsSync(COMMENTS_FILE)) {
        try {
          list = JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf-8'));
        } catch {}
      }

      // Purge any local comments older than 60 days
      const sixtyDaysAgo = Date.now() - TTL_60_DAYS_MS;
      list = list.filter(c => new Date(c.createdAt).getTime() >= sixtyDaysAgo);

      list.push(comment);
      fs.writeFileSync(COMMENTS_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Error saving local comment fallback:', err);
    }
  }

  private static likeLocalComment(commentId: string): number {
    ensureDataDir();
    try {
      if (!fs.existsSync(COMMENTS_FILE)) return 1;
      const list: Comment[] = JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf-8'));
      const idx = list.findIndex(c => c._id === commentId);
      if (idx !== -1) {
        list[idx].likes = (list[idx].likes || 0) + 1;
        fs.writeFileSync(COMMENTS_FILE, JSON.stringify(list, null, 2), 'utf-8');
        return list[idx].likes;
      }
    } catch {}
    return 1;
  }
}
