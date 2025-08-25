import { assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";

Deno.test("Parser - @from block with comments and blanks", () => {
  const content = [
    "@from gcp://p/s {",
    "  # comment",
    '  USER = "db_user#latest"',
    "  ",
    '  PASS = "db_pass#latest"   ',
    "}",
  ].join("\n");

  const parsed = new Parser(content, "test.secret").parse();
  const dir = parsed.nodes.find((n) => n.type === "directive")!;
  const d = dir.data;
  assertEquals(d.type, "from");
  if (d.type === "from") {
    assertEquals(d.baseUri, "gcp://p/s");
    assertEquals(d.mappings.USER, "db_user#latest");
    assertEquals(d.mappings.PASS, "db_pass#latest");
  }
});
