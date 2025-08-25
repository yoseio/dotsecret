import { assertEquals } from "@std/assert";
import { MemoryCache } from "../core/cache/memory.ts";
import { delay } from "@std/async/delay";

Deno.test("MemoryCache - basic operations", async () => {
  const cache = new MemoryCache();

  // Set and get
  await cache.set("key1", "value1");
  assertEquals(await cache.get("key1"), "value1");

  // Non-existent key
  assertEquals(await cache.get("nonexistent"), null);

  // Update existing key
  await cache.set("key1", "updated-value");
  assertEquals(await cache.get("key1"), "updated-value");

  // Delete
  await cache.delete("key1");
  assertEquals(await cache.get("key1"), null);

  cache.destroy();
});

Deno.test("MemoryCache - TTL expiration", async () => {
  const cache = new MemoryCache(100); // Fast cleanup interval for testing

  // Set with short TTL
  await cache.set("expire-fast", "value", 100); // 100ms TTL
  assertEquals(await cache.get("expire-fast"), "value");

  // Wait for expiration
  await delay(150);
  assertEquals(await cache.get("expire-fast"), null);

  // Set with longer TTL
  await cache.set("expire-slow", "value", 1000); // 1s TTL
  assertEquals(await cache.get("expire-slow"), "value");

  // Should still exist after short delay
  await delay(200);
  assertEquals(await cache.get("expire-slow"), "value");

  cache.destroy();
});

Deno.test("MemoryCache - clear all", async () => {
  const cache = new MemoryCache();

  // Add multiple entries
  await cache.set("key1", "value1");
  await cache.set("key2", "value2");
  await cache.set("key3", "value3");

  // Verify they exist
  assertEquals(await cache.get("key1"), "value1");
  assertEquals(await cache.get("key2"), "value2");
  assertEquals(await cache.get("key3"), "value3");

  // Clear all
  await cache.clear();

  // Verify all are gone
  assertEquals(await cache.get("key1"), null);
  assertEquals(await cache.get("key2"), null);
  assertEquals(await cache.get("key3"), null);

  cache.destroy();
});

Deno.test("MemoryCache - default TTL", async () => {
  const cache = new MemoryCache();

  // Set without explicit TTL (should use default 15 minutes)
  await cache.set("default-ttl", "value");
  assertEquals(await cache.get("default-ttl"), "value");

  // Should still exist after a short time
  await delay(100);
  assertEquals(await cache.get("default-ttl"), "value");

  cache.destroy();
});

Deno.test("MemoryCache - cleanup removes expired entries", async () => {
  const cache = new MemoryCache(50); // Very fast cleanup for testing

  // Set multiple entries with different TTLs
  await cache.set("expire1", "value1", 50);
  await cache.set("expire2", "value2", 100);
  await cache.set("expire3", "value3", 200);

  // All should exist initially
  assertEquals(await cache.get("expire1"), "value1");
  assertEquals(await cache.get("expire2"), "value2");
  assertEquals(await cache.get("expire3"), "value3");

  // Wait for first to expire and cleanup to run
  await delay(120);

  // First should be gone, second might be gone (timing sensitive)
  assertEquals(await cache.get("expire1"), null);
  // Skip checking expire2 as it's on the edge of expiry
  assertEquals(await cache.get("expire3"), "value3");

  cache.destroy();
});

Deno.test("MemoryCache - concurrent access", async () => {
  const cache = new MemoryCache();

  // Simulate concurrent writes
  const writes = [];
  for (let i = 0; i < 10; i++) {
    writes.push(cache.set(`concurrent-${i}`, `value-${i}`));
  }
  await Promise.all(writes);

  // Simulate concurrent reads
  const reads = [];
  for (let i = 0; i < 10; i++) {
    reads.push(cache.get(`concurrent-${i}`));
  }
  const results = await Promise.all(reads);

  // Verify all values
  for (let i = 0; i < 10; i++) {
    assertEquals(results[i], `value-${i}`);
  }

  cache.destroy();
});

Deno.test("MemoryCache - empty value storage", async () => {
  const cache = new MemoryCache();

  // Should handle empty strings
  await cache.set("empty", "");
  assertEquals(await cache.get("empty"), "");

  // Different from non-existent
  assertEquals(await cache.get("nonexistent"), null);

  cache.destroy();
});

Deno.test("MemoryCache - overwrite with different TTL", async () => {
  const cache = new MemoryCache();

  // Set with long TTL
  await cache.set("key", "value1", 10000);
  assertEquals(await cache.get("key"), "value1");

  // Overwrite with short TTL
  await cache.set("key", "value2", 100);
  assertEquals(await cache.get("key"), "value2");

  // Wait for new TTL to expire
  await delay(150);
  assertEquals(await cache.get("key"), null);

  cache.destroy();
});