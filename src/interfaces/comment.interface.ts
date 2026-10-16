export interface Comment {
  _id?: string;
  targetId: string;       // Article slug, circular ID, or page identifier (e.g., 'aktu-oneview-result-2026')
  author: string;         // Name of the student or "AKTU Student"
  avatarSeed?: string;    // Deterministic avatar seed (e.g. initial letters or random string)
  content: string;        // Comment body (sanitized text)
  createdAt: Date;        // Timestamp when comment was created (MongoDB TTL index target)
  expiresAt: Date;        // Explicit expiration date (createdAt + 60 days)
  likes: number;          // Upvote counter
  college?: string;       // Optional college / branch info
  status: 'active' | 'flagged' | 'deleted';
}

export interface CommentInput {
  targetId: string;
  author: string;
  content: string;
  college?: string;
}
