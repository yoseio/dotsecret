import { assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";
import { Evaluator } from "../core/evaluator.ts";
import { MemoryCache } from "../core/cache/memory.ts";
import { DefaultPolicy } from "../core/policy.ts";
import { NoOpAuditLogger } from "../core/audit.ts";

async function evalWithOpts(content: string, opts: { pure?: boolean } = {}) {
  const parsed = new Parser(content, "<memory>").parse();
  const cache = new MemoryCache();
  const ev = new Evaluator(cache, new DefaultPolicy(), new NoOpAuditLogger(), opts);
  try {
    return await ev.evaluate([parsed]);
  } finally {
    cache.destroy();
  }
}

Deno.test("Evaluator - merges parent env when not pure", async () => {
  Deno.env.set("PARENT_MERGE_TEST", "merge-ok");
  try {
    const res = await evalWithOpts("", {});
    assertEquals(res.env.PARENT_MERGE_TEST, "merge-ok");
  } finally {
    Deno.env.delete("PARENT_MERGE_TEST");
  }
});

Deno.test("Evaluator - pure mode skips merge", async () => {
  Deno.env.set("PARENT_MERGE_TEST_2", "merge-ok");
  try {
    const res = await evalWithOpts("", { pure: true });
    assertEquals(res.env.PARENT_MERGE_TEST_2, undefined);
  } finally {
    Deno.env.delete("PARENT_MERGE_TEST_2");
  }
});
