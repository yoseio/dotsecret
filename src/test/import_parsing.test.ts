import { assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";

Deno.test("Parser - @import with prefix and case upper", () => {
  const content = `@import gcp://projects/x/secrets prefix=APP_ case=upper`;
  const parsed = new Parser(content, "test.secret").parse();
  const dir = parsed.nodes.find((n) => n.type === "directive")!;
  const imp = dir.data;
  assertEquals(imp.type, "import");
  if (imp.type === "import") {
    assertEquals(imp.uri, "gcp://projects/x/secrets");
    assertEquals(imp.prefix, "APP_");
    assertEquals(imp.case, "upper");
  }
});

Deno.test("Parser - @import with lower case option", () => {
  const content = `@import gcp://p/s case=lower`;
  const parsed = new Parser(content, "test.secret").parse();
  const imp = parsed.nodes.find((n) => n.type === "directive")!.data;
  assertEquals(imp.type, "import");
  if (imp.type === "import") {
    assertEquals(imp.case, "lower");
  }
});

Deno.test("Parser - @import default case keep (undefined)", () => {
  const content = `@import gcp://p/s prefix=K_`;
  const parsed = new Parser(content, "test.secret").parse();
  const imp = parsed.nodes.find((n) => n.type === "directive")!.data;
  assertEquals(imp.type, "import");
  if (imp.type === "import") {
    assertEquals(imp.case, undefined);
    assertEquals(imp.prefix, "K_");
  }
});
