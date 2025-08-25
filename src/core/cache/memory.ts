import type { Cache } from "../types.ts";

interface CacheEntry {
  value: string;
  expires: number;
}

export class MemoryCache implements Cache {
  private entries = new Map<string, CacheEntry>();
  private cleanupInterval: number | null = null;

  constructor(cleanupIntervalMs = 60000) {
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }

  get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return Promise.resolve(null);

    if (Date.now() > entry.expires) {
      this.entries.delete(key);
      return Promise.resolve(null);
    }

    return Promise.resolve(entry.value);
  }

  set(key: string, value: string, ttl?: number): Promise<void> {
    const expires = ttl ? Date.now() + ttl : Date.now() + 900000; // Default 15 minutes
    this.entries.set(key, { value, expires });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.entries.clear();
    return Promise.resolve();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now > entry.expires) {
        this.entries.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.entries.clear();
  }
}
