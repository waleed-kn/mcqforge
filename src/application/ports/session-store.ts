export type AnonymousSession = {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  hardExpiresAt: number;
};

export interface SessionStore {
  create(id: string, now: number): Promise<AnonymousSession>;
  getAndTouch(id: string, now: number): Promise<AnonymousSession | null>;
  get(id: string, now: number): Promise<AnonymousSession | null>;
}

export interface RateLimitStore {
  consume(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}
