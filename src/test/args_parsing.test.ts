import { assertEquals } from "@std/assert";
import { Parser } from "../core/parser.ts";

Deno.test("Parser - function args with commas and equals in quoted values", () => {
  const content = 'CALL = !json(value="{\\"a,b\\":\\"1=2\\"}", path="a,b")';
  const parsed = new Parser(content, "test.secret").parse();
  const assign = parsed.nodes.find((n) => n.type === "assignment")!.data;
  const provider = assign.expression.provider;
  if (!provider || provider.kind !== "call") throw new Error("expected call provider");
  assertEquals(provider.fn, "json");
  assertEquals(provider.args.value, '{"a,b":"1=2"}');
  assertEquals(provider.args.path, "a,b");
});
