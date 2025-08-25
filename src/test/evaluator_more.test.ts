import { assert, assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";
import { Evaluator } from "../core/evaluator.ts";
import { MemoryCache } from "../core/cache/memory.ts";
import { DefaultPolicy } from "../core/policy.ts";
import { NoOpAuditLogger } from "../core/audit.ts";

async function evaluate(content: string, opts: { profile?: string } = {}) {
  const parsed = new Parser(content, "<memory>").parse();
  const cache = new MemoryCache();
  const evaluator = new Evaluator(cache, new DefaultPolicy(), new NoOpAuditLogger(), {
    profile: opts.profile,
  });
  const result = await evaluator.evaluate([parsed]);
  cache.destroy();
  return result;
}

Deno.test("Evaluator - '+=' without existing value has no separator", async () => {
  const res = await evaluate('PATH += (":") "/bin"');
  assertEquals(res.env.PATH, "/bin");
});

Deno.test("Evaluator - metadata transforms record applied pipes", async () => {
  const res = await evaluate('A = " x " | trim | upper');
  assertEquals(res.env.A, "X");
  assert(Array.isArray(res.metadata.A.transforms));
  assertEquals(res.metadata.A.transforms, ["trim", "upper"]);
});

Deno.test("Evaluator - unknown provider records error and skips key", async () => {
  const res = await evaluate('X = !nope(value="test")');
  assertEquals(res.env.X, undefined);
  assert(res.errors.length > 0);
});

Deno.test("Evaluator - @if with profile condition applies", async () => {
  const content = [
    '@if profile == "prod" {',
    '  FLAG = "1"',
    "}",
  ].join("\n");
  const res1 = await evaluate(content, { profile: "prod" });
  assertEquals(res1.env.FLAG, "1");
  const res2 = await evaluate(content, { profile: "dev" });
  assertEquals(res2.env.FLAG, undefined);
});

Deno.test("Evaluator - @if with env() condition applies", async () => {
  Deno.env.set("COND_VAR", "yes");
  try {
    const content = [
      '@if env("COND_VAR") == "yes" {',
      '  OK = "true"',
      "}",
    ].join("\n");
    const res = await evaluate(content);
    assertEquals(res.env.OK, "true");
  } finally {
    Deno.env.delete("COND_VAR");
  }
});

Deno.test("Evaluator - @from file:// loads mapped files", async () => {
  const dir = await Deno.makeTempDir({ prefix: "dotsecret-test-" });
  try {
    await Deno.writeTextFile(`${dir}/a.txt`, "A");
    await Deno.writeTextFile(`${dir}/b.txt`, "B");
    const content = [
      `@from file://${dir} {`,
      '  FIRST = "a.txt"',
      '  SECOND = "b.txt"',
      "}",
    ].join("\n");
    const res = await evaluate(content);
    assertEquals(res.env.FIRST, "A");
    assertEquals(res.env.SECOND, "B");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
