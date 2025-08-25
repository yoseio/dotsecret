import { assertEquals } from "@std/assert";
import { interpolate } from "../core/interpolate.ts";

Deno.test("interpolate - basic variable substitution", async () => {
  const definedEnv = { USER: "alice", HOST: "localhost" };
  const parentEnv = { SHELL: "/bin/bash" };

  const result = await interpolate(
    "Hello ${USER} on ${HOST}",
    definedEnv,
    parentEnv
  );

  assertEquals(result, "Hello alice on localhost");
});

Deno.test("interpolate - fallback to parent environment", async () => {
  const definedEnv = { USER: "alice" };
  const parentEnv = { HOST: "parent-host", SHELL: "/bin/bash" };

  const result = await interpolate(
    "${USER}@${HOST} using ${SHELL}",
    definedEnv,
    parentEnv
  );

  assertEquals(result, "alice@parent-host using /bin/bash");
});

Deno.test("interpolate - undefined variables remain unchanged", async () => {
  const definedEnv = { USER: "alice" };
  const parentEnv = { HOST: "localhost" };

  const result = await interpolate(
    "${USER} ${UNDEFINED_VAR} ${HOST}",
    definedEnv,
    parentEnv
  );

  assertEquals(result, "alice ${UNDEFINED_VAR} localhost");
});

Deno.test("interpolate - nested interpolation not supported", async () => {
  const definedEnv = { 
    VAR: "USER",
    USER: "alice" 
  };
  const parentEnv = {};

  const result = await interpolate(
    "${${VAR}}",
    definedEnv,
    parentEnv
  );

  // Should not do nested interpolation
  assertEquals(result, "${${VAR}}");
});

Deno.test("interpolate - escaped dollar signs", async () => {
  const definedEnv = { USER: "alice" };
  const parentEnv = {};

  const result = await interpolate(
    "\\${USER} is ${USER}",
    definedEnv,
    parentEnv
  );

  // Note: The parser should handle escaping, not interpolate
  assertEquals(result, "\\alice is alice");
});

Deno.test("interpolate - empty string values", async () => {
  const definedEnv = { EMPTY: "" };
  const parentEnv = { ALSO_EMPTY: "" };

  const result = await interpolate(
    ">${EMPTY}< and >${ALSO_EMPTY}<",
    definedEnv,
    parentEnv
  );

  assertEquals(result, ">< and ><");
});

Deno.test("interpolate - whitespace in variable names", async () => {
  const definedEnv = { USER: "alice" };
  const parentEnv = {};

  const result = await interpolate(
    "${ USER } and ${USER}",
    definedEnv,
    parentEnv
  );

  assertEquals(result, "alice and alice");
});

Deno.test("interpolate - special characters in values", async () => {
  const definedEnv = { 
    SPECIAL: "!@#$%^&*()",
    PATH: "/usr/bin:/usr/local/bin"
  };
  const parentEnv = {};

  const result = await interpolate(
    "Special: ${SPECIAL}, Path: ${PATH}",
    definedEnv,
    parentEnv
  );

  assertEquals(result, "Special: !@#$%^&*(), Path: /usr/bin:/usr/local/bin");
});

Deno.test("interpolate - multiple occurrences", async () => {
  const definedEnv = { APP: "myapp" };
  const parentEnv = {};

  const result = await interpolate(
    "${APP}-${APP}-${APP}",
    definedEnv,
    parentEnv
  );

  assertEquals(result, "myapp-myapp-myapp");
});

Deno.test("interpolate - no interpolation needed", async () => {
  const definedEnv = { USER: "alice" };
  const parentEnv = {};

  const result = await interpolate(
    "No variables here!",
    definedEnv,
    parentEnv
  );

  assertEquals(result, "No variables here!");
});

Deno.test("interpolate - complex database URL", async () => {
  const definedEnv = { 
    DB_USER: "admin",
    DB_PASS: "secret123",
    DB_HOST: "db.example.com",
    DB_PORT: "5432",
    DB_NAME: "myapp"
  };
  const parentEnv = {};

  const result = await interpolate(
    "postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}",
    definedEnv,
    parentEnv
  );

  assertEquals(
    result,
    "postgres://admin:secret123@db.example.com:5432/myapp"
  );
});

Deno.test("interpolate - priority test (defined over parent)", async () => {
  const definedEnv = { USER: "defined-user" };
  const parentEnv = { USER: "parent-user" };

  const result = await interpolate(
    "User is ${USER}",
    definedEnv,
    parentEnv
  );

  assertEquals(result, "User is defined-user");
});