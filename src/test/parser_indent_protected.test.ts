import { assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";

Deno.test("Parser - indented and protected assignments", () => {
  const content = [
    '  INDENTED = "ok"',
    '    !protected SEC = "p"',
  ].join("\n");
  const result = new Parser(content, "test.secret").parse();
  const assigns = result.nodes.filter((n) => n.type === "assignment");
  assertEquals(assigns.length, 2);
  assertEquals(assigns[0].data.key, "INDENTED");
  assertEquals(assigns[0].data.expression.literal, "ok");
  assertEquals(assigns[1].data.key, "SEC");
  assertEquals(assigns[1].data.options.protected, true);
});
