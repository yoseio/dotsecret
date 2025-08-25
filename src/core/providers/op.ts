import type { BatchQuery, KV, Provider, ProviderRef, ResolveContext } from "../types.ts";

interface OnePasswordItem {
  id: string;
  title: string;
  vault: {
    id: string;
    name: string;
  };
  fields: Array<{
    id: string;
    label: string;
    value: string;
    type: string;
  }>;
}

export class OnePasswordProvider implements Provider {
  name = "op";

  async resolveSingle(ref: ProviderRef, ctx: ResolveContext): Promise<string> {
    let vaultName: string;
    let itemName: string;
    let fieldName: string;

    if (ref.kind === "uri") {
      // Parse URI: op://vaults/<vault>/items/<item>/fields/<field>
      const match = ref.uri.match(/^op:\/\/vaults\/([^\/]+)\/items\/([^\/]+)\/fields\/([^\/]+)$/);
      if (!match) {
        throw new Error(`Invalid 1Password URI: ${ref.uri}`);
      }
      vaultName = match[1];
      itemName = match[2];
      fieldName = match[3];
    } else {
      // Function call: op(vault="v", item="i", field="f")
      vaultName = ref.args.vault || "Private";
      itemName = ref.args.item || ref.args.value;
      fieldName = ref.args.field || "password";

      if (!itemName) {
        throw new Error("Item name is required");
      }
    }

    const cacheKey = `op:${vaultName}/${itemName}/${fieldName}`;
    const cached = await ctx.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Check if we should use Connect or CLI
    const connectHost = Deno.env.get("OP_CONNECT_HOST");
    const connectToken = Deno.env.get("OP_CONNECT_TOKEN");

    if (connectHost && connectToken) {
      return await this.resolveViaConnect(
        vaultName,
        itemName,
        fieldName,
        connectHost,
        connectToken,
        ctx,
      );
    } else {
      // Check policy for CLI fallback
      const policyEffect = await ctx.policy.onProvider?.(ref, {
        action: "run",
        profile: undefined,
        scopes: [],
        overlays: [],
        flags: {},
        isCI: !!Deno.env.get("CI"),
        env: Deno.env.toObject(),
      });

      if (policyEffect?.effect === "deny") {
        throw new Error("1Password CLI access denied by policy");
      }

      return await this.resolveViaCLI(vaultName, itemName, fieldName, ctx);
    }
  }

  async resolveBatch(query: BatchQuery, _ctx: ResolveContext): Promise<KV> {
    const connectHost = Deno.env.get("OP_CONNECT_HOST");
    const connectToken = Deno.env.get("OP_CONNECT_TOKEN");

    if (!connectHost || !connectToken) {
      throw new Error("Batch operations require 1Password Connect");
    }

    // Parse base URI to get vault and item
    const match = query.baseUri.match(/^op:\/\/vaults\/([^\/]+)\/items\/([^\/]+)$/);
    if (!match) {
      throw new Error(`Invalid 1Password batch URI: ${query.baseUri}`);
    }
    const vaultName = match[1];
    const itemName = match[2];

    const item = await this.getItemViaConnect(vaultName, itemName, connectHost, connectToken);
    const result: KV = {};

    for (const field of item.fields) {
      if (field.type === "CONCEALED" || field.type === "STRING") {
        const key = query.prefix ? `${query.prefix}${field.label}` : field.label;
        result[key] = field.value;
      }
    }

    return result;
  }

  private async resolveViaConnect(
    vaultName: string,
    itemName: string,
    fieldName: string,
    host: string,
    token: string,
    ctx: ResolveContext,
  ): Promise<string> {
    const item = await this.getItemViaConnect(vaultName, itemName, host, token);

    const field = item.fields.find((f) =>
      f.label === fieldName ||
      f.id === fieldName
    );

    if (!field) {
      throw new Error(`Field ${fieldName} not found in item ${itemName}`);
    }

    const cacheKey = `op:${vaultName}/${itemName}/${fieldName}`;
    await ctx.cache.set(cacheKey, field.value, 300000); // Cache for 5 minutes

    return field.value;
  }

  private async getItemViaConnect(
    vaultName: string,
    itemName: string,
    host: string,
    token: string,
  ): Promise<OnePasswordItem> {
    // First, get vault ID
    const vaultsResponse = await fetch(`${host}/v1/vaults`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!vaultsResponse.ok) {
      throw new Error(`Failed to fetch vaults: ${vaultsResponse.status}`);
    }

    const vaults: Array<{ id: string; name: string }> = await vaultsResponse.json();
    const vault = vaults.find((v) => v.name === vaultName || v.id === vaultName);

    if (!vault) {
      throw new Error(`Vault ${vaultName} not found`);
    }

    // Get items in vault
    const itemsResponse = await fetch(`${host}/v1/vaults/${vault.id}/items`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!itemsResponse.ok) {
      throw new Error(`Failed to fetch items: ${itemsResponse.status}`);
    }

    const items: Array<{ id: string; title: string }> = await itemsResponse.json();
    const itemSummary = items.find((i) => i.title === itemName || i.id === itemName);

    if (!itemSummary) {
      throw new Error(`Item ${itemName} not found in vault ${vaultName}`);
    }

    // Get full item details
    const itemResponse = await fetch(`${host}/v1/vaults/${vault.id}/items/${itemSummary.id}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!itemResponse.ok) {
      throw new Error(`Failed to fetch item details: ${itemResponse.status}`);
    }

    return await itemResponse.json();
  }

  private async resolveViaCLI(
    vaultName: string,
    itemName: string,
    fieldName: string,
    ctx: ResolveContext,
  ): Promise<string> {
    const command = new Deno.Command("op", {
      args: ["read", `op://vaults/${vaultName}/items/${itemName}/fields/${fieldName}`],
      stdout: "piped",
      stderr: "piped",
      env: {
        ...Deno.env.toObject(),
        OP_FORMAT: "json",
      },
    });

    const { code, stdout, stderr } = await command.output();
    if (code !== 0) {
      const error = new TextDecoder().decode(stderr);
      throw new Error(`1Password CLI failed: ${error}`);
    }

    const value = new TextDecoder().decode(stdout).trim();

    const cacheKey = `op:${vaultName}/${itemName}/${fieldName}`;
    await ctx.cache.set(cacheKey, value, 300000); // Cache for 5 minutes

    return value;
  }
}
