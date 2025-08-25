type Argv = { _: unknown[] } & Record<string, unknown>;

export async function cacheCommand(args: Argv): Promise<void> {
  const subcommand = (args._[1] ?? "").toString();

  if (subcommand !== "purge") {
    console.error("Usage: dotsecret cache purge");
    Deno.exit(1);
  }

  console.log("Purging cache...");

  // Memory cache is per-process, so we only need to clear disk cache
  const cacheDir = getCacheDir();

  try {
    await Deno.remove(cacheDir, { recursive: true });
    console.log(`✓ Cache purged successfully from ${cacheDir}`);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log("✓ Cache is already empty");
    } else {
      console.error(
        `✗ Failed to purge cache: ${error instanceof Error ? error.message : String(error)}`,
      );
      Deno.exit(1);
    }
  }
}

function getCacheDir(): string {
  const xdgCache = Deno.env.get("XDG_CACHE_HOME");
  const home = Deno.env.get("HOME");

  if (xdgCache) {
    return `${xdgCache}/dotsecret`;
  } else if (home) {
    return `${home}/.cache/dotsecret`;
  } else {
    throw new Error("Unable to determine cache directory");
  }
}
