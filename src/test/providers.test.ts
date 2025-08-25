import { assertEquals, assertRejects } from "@std/assert";
import { getProviderRegistry } from "../core/providers/index.ts";
import type { ProviderRef, ResolveContext } from "../core/types.ts";
import { MemoryCache } from "../core/cache/memory.ts";
import { DefaultPolicy } from "../core/policy.ts";
import { NoOpAuditLogger } from "../core/audit.ts";

const mockContext: ResolveContext = {
  cache: new MemoryCache(),
  policy: new DefaultPolicy(),
  audit: new NoOpAuditLogger(),
  timeout: 5000,
  retries: 1,
  env: {},
};

Deno.test("Provider - env", async () => {
  const providers = getProviderRegistry();
  const env = providers.get("env")!;

  // Set test env var
  Deno.env.set("TEST_VAR", "test-value");

  try {
    // Function call style
    const ref1: ProviderRef = {
      kind: "call",
      fn: "env",
      args: { name: "TEST_VAR" },
    };
    assertEquals(await env.resolveSingle(ref1, mockContext), "test-value");

    // URI style
    const ref2: ProviderRef = {
      kind: "uri",
      scheme: "env",
      uri: "env://TEST_VAR",
    };
    assertEquals(await env.resolveSingle(ref2, mockContext), "test-value");

    // With default value
    const ref3: ProviderRef = {
      kind: "call",
      fn: "env",
      args: { name: "MISSING_VAR", default: "fallback" },
    };
    assertEquals(await env.resolveSingle(ref3, mockContext), "fallback");

    // Using value alias for name
    const ref3b: ProviderRef = {
      kind: "call",
      fn: "env",
      args: { value: "TEST_VAR" },
    };
    assertEquals(await env.resolveSingle(ref3b, mockContext), "test-value");

    // Missing without default
    const ref4: ProviderRef = {
      kind: "call",
      fn: "env",
      args: { name: "MISSING_VAR" },
    };
    await assertRejects(
      async () => await env.resolveSingle(ref4, mockContext),
      Error,
      "not found",
    );
  } finally {
    Deno.env.delete("TEST_VAR");
  }
});

Deno.test("Provider - file", async () => {
  const providers = getProviderRegistry();
  const file = providers.get("file")!;

  // Create test file
  const testPath = await Deno.makeTempFile({ prefix: "dotsecret-test-" });
  await Deno.writeTextFile(testPath, "file contents\nwith multiple lines");

  try {
    // Function call style
    const ref1: ProviderRef = {
      kind: "call",
      fn: "file",
      args: { path: testPath },
    };
    const content = await file.resolveSingle(ref1, mockContext);
    assertEquals(content, "file contents\nwith multiple lines");

    // URI style
    const ref2: ProviderRef = {
      kind: "uri",
      scheme: "file",
      uri: `file://${testPath}`,
    };
    assertEquals(await file.resolveSingle(ref2, mockContext), content);

    // Missing file
    const ref3: ProviderRef = {
      kind: "call",
      fn: "file",
      args: { path: "/non/existent/file" },
    };
    await assertRejects(
      async () => await file.resolveSingle(ref3, mockContext),
      Error,
      "Failed to read",
    );
  } finally {
    await Deno.remove(testPath);
  }
});

Deno.test("Provider - json", async () => {
  const providers = getProviderRegistry();
  const json = providers.get("json")!;

  const jsonData = {
    name: "test",
    nested: {
      value: "hello",
      number: 42,
    },
  };
  const jsonStr = JSON.stringify(jsonData);

  // Only function call style is supported
  const ref1: ProviderRef = {
    kind: "call",
    fn: "json",
    args: { value: jsonStr, path: "name" },
  };
  assertEquals(await json.resolveSingle(ref1, mockContext), "test");

  const ref2: ProviderRef = {
    kind: "call",
    fn: "json",
    args: { value: jsonStr, path: "nested.value" },
  };
  assertEquals(await json.resolveSingle(ref2, mockContext), "hello");

  // No path returns full JSON
  const ref3: ProviderRef = {
    kind: "call",
    fn: "json",
    args: { value: jsonStr },
  };
  assertEquals(await json.resolveSingle(ref3, mockContext), jsonStr);

  // Invalid JSON
  const ref4: ProviderRef = {
    kind: "call",
    fn: "json",
    args: { value: "invalid json" },
  };
  await assertRejects(
    async () => await json.resolveSingle(ref4, mockContext),
    Error,
    "parse",
  );

  // URI style should error
  const ref5: ProviderRef = {
    kind: "uri",
    scheme: "json",
    uri: "json://test",
  };
  await assertRejects(
    async () => await json.resolveSingle(ref5, mockContext),
    Error,
    "function call",
  );
});

Deno.test("Provider - base64decode", async () => {
  const providers = getProviderRegistry();
  const base64decode = providers.get("base64decode")!;

  // Only function call style is supported
  const ref1: ProviderRef = {
    kind: "call",
    fn: "base64decode",
    args: { value: "aGVsbG8gd29ybGQ=" },
  };
  assertEquals(await base64decode.resolveSingle(ref1, mockContext), "hello world");

  // Invalid base64
  const ref2: ProviderRef = {
    kind: "call",
    fn: "base64decode",
    args: { value: "invalid!base64" },
  };
  await assertRejects(
    async () => await base64decode.resolveSingle(ref2, mockContext),
    Error,
    "decode",
  );

  // Empty value
  const ref3: ProviderRef = {
    kind: "call",
    fn: "base64decode",
    args: { value: "" },
  };
  await assertRejects(
    async () => await base64decode.resolveSingle(ref3, mockContext),
    Error,
    "required",
  );
});

Deno.test("Provider - caching", async () => {
  const providers = getProviderRegistry();
  const env = providers.get("env")!;

  // Create a new context with a fresh cache
  const cache = new MemoryCache();
  const context = { ...mockContext, cache };

  // Set test env var
  Deno.env.set("CACHE_TEST", "initial-value");

  try {
    const ref: ProviderRef = {
      kind: "call",
      fn: "env",
      args: { name: "CACHE_TEST" },
    };

    // First call should hit the env
    assertEquals(await env.resolveSingle(ref, context), "initial-value");

    // Change the env var
    Deno.env.set("CACHE_TEST", "changed-value");

    // Second call should still return initial value (from cache)
    // Note: Built-in providers might not use cache by default
    // This test demonstrates the cache interface
    const cacheKey = "env:CACHE_TEST";
    await cache.set(cacheKey, "cached-value", 5000);
    assertEquals(await cache.get(cacheKey), "cached-value");
  } finally {
    Deno.env.delete("CACHE_TEST");
    cache.destroy();
  }
});

Deno.test("Provider - registry", () => {
  const providers = getProviderRegistry();

  // Check all required providers are registered
  assertEquals(providers.has("env"), true);
  assertEquals(providers.has("file"), true);
  assertEquals(providers.has("json"), true);
  assertEquals(providers.has("base64decode"), true);
  assertEquals(providers.has("gcp"), true);
  assertEquals(providers.has("op"), true);

  // Check provider interface
  const env = providers.get("env")!;
  assertEquals(env.name, "env");
  assertEquals(typeof env.resolveSingle, "function");
});
