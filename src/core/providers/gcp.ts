import type { BatchQuery, KV, Provider, ProviderRef, ResolveContext } from "../types.ts";

interface GCPSecretVersion {
  payload: {
    data: string;
  };
}

interface GCPSecret {
  name: string;
  labels?: Record<string, string>;
}

export class GCPSecretManagerProvider implements Provider {
  name = "gcp";
  private accessToken?: string;
  private tokenExpiry?: number;

  async resolveSingle(ref: ProviderRef, ctx: ResolveContext): Promise<string> {
    let resourcePath: string;
    let project: string | undefined;
    let secretName: string;
    let version: string;

    if (ref.kind === "uri") {
      // Parse URI: gcp://projects/<project>/secrets/<name>#<version>
      const match = ref.uri.match(/^gcp:\/\/projects\/([^\/]+)\/secrets\/([^#]+)(?:#(.+))?$/);
      if (!match) {
        throw new Error(`Invalid GCP Secret Manager URI: ${ref.uri}`);
      }
      project = match[1];
      secretName = match[2];
      version = match[3] || "latest";
      resourcePath = `projects/${project}/secrets/${secretName}/versions/${version}`;
    } else {
      // Function call: gcp(secret="name", project="p", version="latest")
      secretName = ref.args.secret || ref.args.name || ref.args.value;
      project = ref.args.project;
      version = ref.args.version || "latest";
      
      if (!secretName) {
        throw new Error("Secret name is required");
      }
      
      // If project not specified, try to get from metadata service
      if (!project) {
        project = await this.getProjectFromMetadata();
      }
      
      resourcePath = `projects/${project}/secrets/${secretName}/versions/${version}`;
    }

    const cacheKey = `gcp:${resourcePath}`;
    const cached = await ctx.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const token = await this.getAccessToken();
    const url = `https://secretmanager.googleapis.com/v1/${resourcePath}:access`;

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(ctx.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch GCP secret: ${response.status} - ${error}`);
    }

    const data: GCPSecretVersion = await response.json();
    const value = atob(data.payload.data);

    await ctx.cache.set(cacheKey, value, 300000); // Cache for 5 minutes
    return value;
  }

  async resolveBatch(query: BatchQuery, ctx: ResolveContext): Promise<KV> {
    // Parse base URI to get project
    const match = query.baseUri.match(/^gcp:\/\/projects\/([^\/]+)\/secrets$/);
    if (!match) {
      throw new Error(`Invalid GCP batch URI: ${query.baseUri}`);
    }
    const project = match[1];

    const token = await this.getAccessToken();
    let url = `https://secretmanager.googleapis.com/v1/projects/${project}/secrets`;

    // Add filter for labels
    if (query.filter) {
      const filters = Object.entries(query.filter)
        .map(([k, v]) => `labels.${k}="${v}"`)
        .join(" AND ");
      url += `?filter=${encodeURIComponent(filters)}`;
    }

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(ctx.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list GCP secrets: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const secrets: GCPSecret[] = data.secrets || [];
    const result: KV = {};

    // Fetch each secret's latest version
    await Promise.all(
      secrets.map(async (secret) => {
        const name = secret.name.split("/").pop()!;
        if (query.prefix && !name.startsWith(query.prefix)) {
          return;
        }

        try {
          const versionUrl = `https://secretmanager.googleapis.com/v1/${secret.name}/versions/latest:access`;
          const versionResponse = await fetch(versionUrl, {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(ctx.timeout),
          });

          if (versionResponse.ok) {
            const versionData: GCPSecretVersion = await versionResponse.json();
            const key = query.prefix ? name.slice(query.prefix.length) : name;
            result[key] = atob(versionData.payload.data);
          }
        } catch (error) {
          ctx.audit.log({
            timestamp: new Date(),
            action: "batch_secret_fetch",
            key: name,
            provider: "gcp",
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    return result;
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Try ADC first (GOOGLE_APPLICATION_CREDENTIALS)
    const adcPath = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS");
    if (adcPath) {
      return this.getTokenFromServiceAccount(adcPath);
    }

    // Try metadata service (for Workload Identity)
    try {
      return await this.getTokenFromMetadata();
    } catch {
      // Fall back to gcloud CLI if available
      return await this.getTokenFromGcloud();
    }
  }

  private async getTokenFromServiceAccount(_path: string): Promise<string> {
    // const content = await Deno.readTextFile(path);
    // const serviceAccount = JSON.parse(content);

    // Create JWT and exchange for access token
    // This is simplified - in production, use a proper JWT library
    // const now = Math.floor(Date.now() / 1000);
    // const jwt = {
    //   iss: serviceAccount.client_email,
    //   scope: "https://www.googleapis.com/auth/cloud-platform",
    //   aud: serviceAccount.token_uri,
    //   exp: now + 3600,
    //   iat: now,
    // };

    // TODO: Implement proper JWT signing
    throw new Error("Service account authentication not fully implemented");
  }

  private async getTokenFromMetadata(): Promise<string> {
    const response = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      {
        headers: {
          "Metadata-Flavor": "Google",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to get token from metadata service");
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);
    return this.accessToken!;
  }

  private async getTokenFromGcloud(): Promise<string> {
    const command = new Deno.Command("gcloud", {
      args: ["auth", "print-access-token"],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();
    if (code !== 0) {
      throw new Error(`gcloud auth failed: ${new TextDecoder().decode(stderr)}`);
    }

    this.accessToken = new TextDecoder().decode(stdout).trim();
    this.tokenExpiry = Date.now() + 3600000; // Assume 1 hour
    return this.accessToken;
  }

  private async getProjectFromMetadata(): Promise<string> {
    try {
      const response = await fetch(
        "http://metadata.google.internal/computeMetadata/v1/project/project-id",
        {
          headers: {
            "Metadata-Flavor": "Google",
          },
        }
      );

      if (response.ok) {
        return await response.text();
      }
    } catch {
      // Ignore metadata service errors
    }

    // Try gcloud config
    try {
      const command = new Deno.Command("gcloud", {
        args: ["config", "get-value", "project"],
        stdout: "piped",
        stderr: "piped",
      });

      const { code, stdout } = await command.output();
      if (code === 0) {
        return new TextDecoder().decode(stdout).trim();
      }
    } catch {
      // Ignore gcloud errors
    }

    throw new Error("Could not determine GCP project");
  }
}