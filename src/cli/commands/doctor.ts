export async function doctorCommand(): Promise<void> {
  console.log("dotsecret Doctor\n");
  console.log("Checking system configuration and connectivity...\n");

  let hasIssues = false;

  // Check Deno version
  console.log("Deno Version:");
  console.log(`  ${Deno.version.deno} (required: >= 1.38.0)`);
  console.log(`  TypeScript: ${Deno.version.typescript}`);
  console.log(`  V8: ${Deno.version.v8}\n`);

  // Check GCP authentication
  console.log("Google Cloud Platform:");
  const gcpAuth = await checkGCPAuth();
  if (gcpAuth.ok) {
    console.log(`  ✓ Authentication: ${gcpAuth.method}`);
    if (gcpAuth.project) {
      console.log(`  ✓ Default project: ${gcpAuth.project}`);
    }
  } else {
    console.error(`  ✗ Authentication: ${gcpAuth.error}`);
    hasIssues = true;
  }

  // Check 1Password
  console.log("\n1Password:");
  const opAuth = await check1PasswordAuth();
  if (opAuth.ok) {
    console.log(`  ✓ Authentication: ${opAuth.method}`);
    if (opAuth.version) {
      console.log(`  ✓ CLI version: ${opAuth.version}`);
    }
  } else {
    console.warn(`  ⚠ Authentication: ${opAuth.error}`);
  }

  // Check network connectivity
  console.log("\nNetwork Connectivity:");
  const endpoints = [
    { name: "GCP Secret Manager", url: "https://secretmanager.googleapis.com/" },
    { name: "GCP Metadata", url: "http://metadata.google.internal/", optional: true },
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok || response.status === 401 || response.status === 403) {
        console.log(`  ✓ ${endpoint.name}: Reachable`);
      } else {
        console.warn(`  ⚠ ${endpoint.name}: HTTP ${response.status}`);
      }
    } catch (error) {
      if (endpoint.optional) {
        console.log(`  - ${endpoint.name}: Not available (optional)`);
      } else {
        console.error(`  ✗ ${endpoint.name}: ${error instanceof Error ? error.message : String(error)}`);
        hasIssues = true;
      }
    }
  }

  // Check cache directory
  console.log("\nCache Configuration:");
  const cacheDir = Deno.env.get("XDG_CACHE_HOME") || 
                  Deno.env.get("HOME") + "/.cache";
  const dotsecretCache = `${cacheDir}/dotsecret`;
  try {
    await Deno.stat(dotsecretCache);
    console.log(`  ✓ Cache directory exists: ${dotsecretCache}`);
  } catch {
    console.log(`  - Cache directory will be created at: ${dotsecretCache}`);
  }

  // Check policy files
  console.log("\nPolicy Configuration:");
  const policyFiles = ["dotsecret.policy.ts", "dotsecret.policy.json"];
  let foundPolicy = false;
  for (const file of policyFiles) {
    try {
      await Deno.stat(file);
      console.log(`  ✓ Found policy file: ${file}`);
      foundPolicy = true;
      break;
    } catch {
      // Continue checking
    }
  }
  if (!foundPolicy) {
    console.log("  - No policy file found (using default policy)");
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  if (hasIssues) {
    console.error("\n✗ Some issues were detected. Please fix them before using dotsecret.");
    Deno.exit(1);
  } else {
    console.log("\n✓ All checks passed! dotsecret is ready to use.");
  }
}

async function checkGCPAuth(): Promise<{ ok: boolean; method?: string; project?: string; error?: string }> {
  // Check ADC
  const adcPath = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS");
  if (adcPath) {
    try {
      await Deno.stat(adcPath);
      return { ok: true, method: `Service Account (${adcPath})` };
    } catch {
      return { ok: false, error: `ADC file not found: ${adcPath}` };
    }
  }

  // Check metadata service
  try {
    const response = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/project/project-id",
      {
        headers: { "Metadata-Flavor": "Google" },
        signal: AbortSignal.timeout(2000),
      }
    );
    if (response.ok) {
      const project = await response.text();
      return { ok: true, method: "Metadata Service (Workload Identity)", project };
    }
  } catch {
    // Continue to gcloud check
  }

  // Check gcloud
  try {
    const command = new Deno.Command("gcloud", {
      args: ["config", "get-value", "project"],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout } = await command.output();
    if (code === 0) {
      const project = new TextDecoder().decode(stdout).trim();
      return { ok: true, method: "gcloud CLI", project };
    }
  } catch {
    // gcloud not available
  }

  return { ok: false, error: "No authentication method available" };
}

async function check1PasswordAuth(): Promise<{ ok: boolean; method?: string; version?: string; error?: string }> {
  // Check Connect
  const connectHost = Deno.env.get("OP_CONNECT_HOST");
  const connectToken = Deno.env.get("OP_CONNECT_TOKEN");
  
  if (connectHost && connectToken) {
    try {
      const response = await fetch(`${connectHost}/v1/vaults`, {
        headers: {
          "Authorization": `Bearer ${connectToken}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok || response.status === 401) {
        return { ok: true, method: `Connect (${connectHost})` };
      }
    } catch (error) {
      return { ok: false, error: `Connect unreachable: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  // Check CLI
  try {
    const command = new Deno.Command("op", {
      args: ["--version"],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout } = await command.output();
    if (code === 0) {
      const version = new TextDecoder().decode(stdout).trim();
      return { ok: true, method: "CLI", version };
    }
  } catch {
    // op CLI not available
  }

  return { ok: false, error: "Neither Connect nor CLI configured" };
}