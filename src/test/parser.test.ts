import { assertEquals, assertThrows } from "@std/assert";
import { Parser } from "../core/parser.ts";

Deno.test("Parser - basic key-value assignment", () => {
  const content = `
APP_NAME = "my-app"
PORT = 3000
DEBUG = true
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  assertEquals(result.nodes.length, 3);

  const assignments = result.nodes.filter((n) => n.type === "assignment");
  assertEquals(assignments.length, 3);

  const appName = assignments[0].data;
  assertEquals(appName.key, "APP_NAME");
  assertEquals(appName.expression.literal, "my-app");
  assertEquals(appName.operator, "=");
});

Deno.test("Parser - evaluation trigger", () => {
  const content = `
SECRET = !gcp(secret="api-key", project="my-project")
LITERAL = "!not-evaluated"
ESCAPED = \\!escaped
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const assignments = result.nodes.filter((n) => n.type === "assignment");

  assertEquals(assignments[0].data.expression.trigger, "!");
  assertEquals(assignments[0].data.expression.provider?.kind, "call");
  const provider1 = assignments[0].data.expression.provider;
  assertEquals(provider1?.kind, "call");
  if (provider1?.kind === "call") {
    assertEquals(provider1.fn, "gcp");
  }

  assertEquals(assignments[1].data.expression.trigger, "");
  assertEquals(assignments[1].data.expression.literal, "!not-evaluated");

  assertEquals(assignments[2].data.expression.trigger, "");
  assertEquals(assignments[2].data.expression.literal, "!escaped");
});

Deno.test("Parser - URI-style provider", () => {
  const content = `
GCP_SECRET = !gcp://projects/my-project/secrets/api-key#latest
OP_TOKEN = !op://vaults/Production/items/API/fields/token
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const assignments = result.nodes.filter((n) => n.type === "assignment");

  const provider2 = assignments[0].data.expression.provider;
  assertEquals(provider2?.kind, "uri");
  if (provider2?.kind === "uri") {
    assertEquals(provider2.scheme, "gcp");
    assertEquals(provider2.uri, "gcp://projects/my-project/secrets/api-key#latest");
  }

  const provider3 = assignments[1].data.expression.provider;
  assertEquals(provider3?.kind, "uri");
  if (provider3?.kind === "uri") {
    assertEquals(provider3.scheme, "op");
  }
});

Deno.test("Parser - pipes", () => {
  const content = `
SIMPLE = !env(name="USER") | upper()
CHAINED = !file(path="cert.pem") | base64encode() | trim()
SOFT_PIPE = !env(name="MISSING") ?| upper() || "default"
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const assignments = result.nodes.filter((n) => n.type === "assignment");

  assertEquals(assignments[0].data.expression.pipes.length, 1);
  assertEquals(assignments[0].data.expression.pipes[0].name, "upper");

  assertEquals(assignments[1].data.expression.pipes.length, 2);
  assertEquals(assignments[1].data.expression.pipes[0].name, "base64encode");
  assertEquals(assignments[1].data.expression.pipes[1].name, "trim");

  assertEquals(assignments[2].data.expression.pipes.length, 1);
  assertEquals(assignments[2].data.expression.pipes[0].soft, true);
  assertEquals(assignments[2].data.expression.fallback, "default");
});

Deno.test("Parser - assignment operators", () => {
  const content = `
OVERRIDE = "value"
CONDITIONAL ?= "default"
APPEND += "/new/path"
APPEND_SEP +=(":")"/extra"
REMOVE = @unset
!protected SECURE = "protected-value"
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const assignments = result.nodes.filter((n) => n.type === "assignment");

  assertEquals(assignments[0].data.operator, "=");
  assertEquals(assignments[1].data.operator, "?=");
  assertEquals(assignments[2].data.operator, "+=");
  assertEquals(assignments[3].data.operator, "+=");
  assertEquals(assignments[3].data.options.separator, ":");
  assertEquals(assignments[4].data.operator, "@unset");
  assertEquals(assignments[5].data.options.protected, true);
});

Deno.test("Parser - sections", () => {
  const content = `
[default]
APP = "default"

[production]
APP = "prod"

[scope:node]
NODE_ENV = "production"

[scope:python extends node]
PYTHONPATH = "./src"
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const sections = result.nodes.filter((n) => n.type === "section");
  assertEquals(sections.length, 4);

  assertEquals(sections[0].data.type, "profile");
  assertEquals(sections[0].data.name, "default");

  assertEquals(sections[1].data.type, "profile");
  assertEquals(sections[1].data.name, "production");

  assertEquals(sections[2].data.type, "scope");
  assertEquals(sections[2].data.name, "node");

  assertEquals(sections[3].data.type, "scope");
  assertEquals(sections[3].data.name, "python");
  assertEquals(sections[3].data.extends, ["node"]);
});

Deno.test("Parser - directives", () => {
  const content = `
@include ./common.secret
@import gcp://projects/my-project/secrets?label.env=prod prefix=APP_
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const directives = result.nodes.filter((n) => n.type === "directive");
  assertEquals(directives.length, 2);

  assertEquals(directives[0].data.type, "include");
  if (directives[0].data.type === "include") {
    assertEquals(directives[0].data.path, "./common.secret");
  }

  assertEquals(directives[1].data.type, "import");
  if (directives[1].data.type === "import") {
    assertEquals(directives[1].data.uri, "gcp://projects/my-project/secrets?label.env=prod");
    assertEquals(directives[1].data.prefix, "APP_");
  }
});

Deno.test("Parser - with directive", () => {
  const content = `
with gcp(project="my-project") {
  DB_USER = !gcp(secret="db_user")
  DB_PASS = !gcp(secret="db_pass")
}
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const directives = result.nodes.filter((n) => n.type === "directive");
  assertEquals(directives.length, 1);

  const withDirective = directives[0].data;
  assertEquals(withDirective.type, "with");
  if (withDirective.type === "with") {
    assertEquals(withDirective.provider, "gcp");
    assertEquals(withDirective.args.project, "my-project");
    assertEquals(withDirective.body.length, 2);
  }
});

Deno.test("Parser - with directive handles blank lines", () => {
  const content = `
with gcp(project="my-project") {
  DB_USER = !gcp(secret="db_user")

  DB_PASS = !gcp(secret="db_pass")
}
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const directives = result.nodes.filter((n) => n.type === "directive");
  assertEquals(directives.length, 1);

  const withDirective = directives[0].data;
  assertEquals(withDirective.type, "with");
  if (withDirective.type === "with") {
    // Should include both assignments even with a blank line between
    const bodyAssignments = withDirective.body.filter((n) => n.type === "assignment");
    assertEquals(bodyAssignments.length, 2);
  }
});

Deno.test("Parser - from directive", () => {
  const content = `
@from gcp://projects/my-project/secrets {
  DB_USER = "db_user#latest"
  DB_PASS = "db_pass#latest"
}
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const directives = result.nodes.filter((n) => n.type === "directive");
  assertEquals(directives.length, 1);

  const fromDirective = directives[0].data;
  assertEquals(fromDirective.type, "from");
  if (fromDirective.type === "from") {
    assertEquals(fromDirective.baseUri, "gcp://projects/my-project/secrets");
    assertEquals(fromDirective.mappings.DB_USER, "db_user#latest");
    assertEquals(fromDirective.mappings.DB_PASS, "db_pass#latest");
  }
});

Deno.test("Parser - if directive", () => {
  const content = `
@if profile == "production" && env("CI") == "true" {
  STRICT_MODE = "true"
}
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const directives = result.nodes.filter((n) => n.type === "directive");
  assertEquals(directives.length, 1);

  const ifDirective = directives[0].data;
  assertEquals(ifDirective.type, "if");
  if (ifDirective.type === "if") {
    assertEquals(ifDirective.condition, `profile == "production" && env("CI") == "true"`);
    assertEquals(ifDirective.body.length, 1);
  }
});

Deno.test("Parser - multiline strings", () => {
  const content = `
CERT = """
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKl...
-----END CERTIFICATE-----
"""
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const assignments = result.nodes.filter((n) => n.type === "assignment");
  assertEquals(assignments.length, 1);

  const cert = assignments[0].data.expression.literal;
  assertEquals(cert?.includes("-----BEGIN CERTIFICATE-----"), true);
  assertEquals(cert?.includes("-----END CERTIFICATE-----"), true);
});

Deno.test("Parser - comments", () => {
  const content = `
# This is a comment
APP = "test" # Inline comment not supported, included in value
# Another comment
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const comments = result.nodes.filter((n) => n.type === "comment");
  assertEquals(comments.length, 2);
  assertEquals(comments[0].text, "This is a comment");
  assertEquals(comments[1].text, "Another comment");
});

Deno.test("Parser - invalid syntax", () => {
  assertThrows(
    () => {
      const parser = new Parser("INVALID KEY = value", "test.secret");
      parser.parse();
    },
    Error,
    "Invalid",
  );
});

Deno.test("Parser - pipe with arguments", () => {
  const content = `
REPLACED = "hello world" | replace(from="world", to="deno")
JSON_PATH = !file(path="config.json") | json(path="database.host")
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const assignments = result.nodes.filter((n) => n.type === "assignment");

  assertEquals(assignments[0].data.expression.pipes[0].name, "replace");
  assertEquals(assignments[0].data.expression.pipes[0].args.from, "world");
  assertEquals(assignments[0].data.expression.pipes[0].args.to, "deno");

  assertEquals(assignments[1].data.expression.pipes[0].name, "json");
  assertEquals(assignments[1].data.expression.pipes[0].args.path, "database.host");
});

Deno.test("Parser - literal with '||' is not fallback", () => {
  const content = `
VALUE = "left || right"
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const assignments = result.nodes.filter((n) => n.type === "assignment");
  assertEquals(assignments.length, 1);

  const expr = assignments[0].data.expression;
  // Should keep full literal and not treat as fallback
  assertEquals(expr.literal, "left || right");
  assertEquals(expr.fallback, undefined);
});

Deno.test("Parser - triple-quoted empty string", () => {
  const content = `
EMPTY = """"""  
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const assignments = result.nodes.filter((n) => n.type === "assignment");
  assertEquals(assignments.length, 1);

  const expr = assignments[0].data.expression;
  assertEquals(expr.literal, "");
});

Deno.test("Parser - inline triple-quoted literal on one line", () => {
  const content = `
INLINE = """hello world"""
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const assignments = result.nodes.filter((n) => n.type === "assignment");
  assertEquals(assignments.length, 1);

  const expr = assignments[0].data.expression;
  assertEquals(expr.literal, "hello world");
});

Deno.test("Parser - quoted string unescapes escapes", () => {
  const content = `
ESC = "\\"q\\" \\n"
  `.trim();

  const parser = new Parser(content, "test.secret");
  const result = parser.parse();

  const assignments = result.nodes.filter((n) => n.type === "assignment");
  assertEquals(assignments.length, 1);
  const expr = assignments[0].data.expression;
  // Should start with the unescaped quotes
  assertEquals((expr.literal || "").startsWith('"q"'), true);
});
