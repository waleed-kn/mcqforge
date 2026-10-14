export interface TemporarySessionStore<T> {
  get(sessionId: string): Promise<T | null>;
  set(sessionId: string, value: T, ttlSeconds: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
}
