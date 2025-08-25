import { assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";
import { Evaluator } from "../core/evaluator.ts";
import { MemoryCache } from "../core/cache/memory.ts";
import { DefaultPolicy } from "../core/policy.ts";
import { NoOpAuditLogger } from "../core/audit.ts";

async function evaluate(content: string, opts: { profile?: string; scopes?: string[] } = {}) {
  const file = "<memory>";
  const parsed = new Parser(content, file).parse();
  const cache = new MemoryCache();
  const policy = new DefaultPolicy();
  const audit = new NoOpAuditLogger();
  const evaluator = new Evaluator(cache, policy, audit, {
    profile: opts.profile,
    scopes: opts.scopes,
  });
  const result = await evaluator.evaluate([parsed]);
  cache.destroy();
  return result;
}

Deno.test("Sections - default profile applies when no profile", async () => {
  const content = [
    'GLOBAL = "base"',
    "",
    "[default]",
    'A = "default"',
    "",
    "[production]",
    'A = "prod"',
  ].join("\n");

  const result = await evaluate(content);
  assertEquals(result.env.GLOBAL, "base");
  assertEquals(result.env.A, "default");
});

Deno.test("Sections - selected profile overrides default", async () => {
  const content = [
    "[default]",
    'A = "default"',
    "",
    "[production]",
    'A = "prod"',
  ].join("\n");

  const result = await evaluate(content, { profile: "production" });
  assertEquals(result.env.A, "prod");
});

Deno.test("Sections - scope blocks only apply when selected", async () => {
  const content = [
    "[default]",
    'COMMON = "yes"',
    "",
    "[scope:node]",
    'NODE_ONLY = "1"',
    "",
    "[scope:docker]",
    'DOCKER_ONLY = "1"',
  ].join("\n");

  const resultNone = await evaluate(content, { scopes: [] });
  assertEquals(resultNone.env.COMMON, "yes");
  assertEquals(resultNone.env.NODE_ONLY, undefined);
  assertEquals(resultNone.env.DOCKER_ONLY, undefined);

  const resultNode = await evaluate(content, { scopes: ["node"] });
  assertEquals(resultNode.env.COMMON, "yes");
  assertEquals(resultNode.env.NODE_ONLY, "1");
  assertEquals(resultNode.env.DOCKER_ONLY, undefined);

  const resultBoth = await evaluate(content, { scopes: ["docker", "node"] });
  assertEquals(resultBoth.env.COMMON, "yes");
  assertEquals(resultBoth.env.NODE_ONLY, "1");
  assertEquals(resultBoth.env.DOCKER_ONLY, "1");
});
