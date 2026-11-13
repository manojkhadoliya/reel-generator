/**
 * Thin client for Instagram content publishing. The token goes in a header, never the URL, so it
 * can't leak through error messages or logs.
 *
 * Two kinds of token work, and each only works on its own host:
 * - Instagram Login tokens ("IG..."): graph.instagram.com, where /me is the Instagram account.
 * - Unified login system-user tokens ("EAA...", what new Meta apps issue): graph.facebook.com,
 *   where /me is the system user and the Instagram account comes from assigned_instagram_accounts.
 * The publishing endpoints themselves are identical on both.
 */

export type ContainerStatusCode = "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";

export interface InstagramAccount {
  userId: string;
  username: string;
  /** Only reported for Instagram Login tokens. */
  accountType?: string;
}

export interface ContainerStatus {
  statusCode: ContainerStatusCode;
  /** Human-readable detail Instagram gives alongside ERROR. */
  detail?: string;
}

export interface PublishingQuota {
  used: number;
  limit?: number;
}

export interface InstagramApi {
  getAccount(): Promise<InstagramAccount>;
  getPublishingQuota(userId: string): Promise<PublishingQuota>;
  createReelContainer(userId: string, videoUrl: string, caption: string, coverUrl?: string): Promise<string>;
  getContainerStatus(containerId: string): Promise<ContainerStatus>;
  publishContainer(userId: string, containerId: string): Promise<string>;
  getPermalink(mediaId: string): Promise<string | undefined>;
}

export interface InstagramApiOptions {
  accessToken: string;
  apiVersion?: string;
  /** System-user tokens only: which assigned Instagram account to use when more than one is assigned. */
  accountId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function isInstagramLoginToken(accessToken: string): boolean {
  return accessToken.startsWith("IG");
}

export function createInstagramApi(options: InstagramApiOptions): InstagramApi {
  const { accessToken, apiVersion = "v24.0", accountId, fetchImpl = fetch, timeoutMs = 60_000 } = options;
  const instagramLogin = isInstagramLoginToken(accessToken);
  const host = instagramLogin ? "https://graph.instagram.com" : "https://graph.facebook.com";

  async function call<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${host}/${apiVersion}/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // fetch reports every network failure as "fetch failed"; the useful part (e.g. ENOTFOUND) is in `cause`.
      const cause = (error as Error).cause as { code?: string; message?: string } | undefined;
      const reason = cause?.code ?? cause?.message ?? (error as Error).message;
      throw new Error(`Could not reach Instagram (${method} ${path}): ${reason}`);
    }

    const text = await response.text();
    let json: { error?: { message?: string; code?: number; error_subcode?: number } } & Record<string, unknown>;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Instagram returned a non-JSON response (HTTP ${response.status}) for ${method} ${path}`);
    }
    if (!response.ok || json.error) {
      const { message = "unknown error", code, error_subcode: subcode } = json.error ?? {};
      throw new Error(
        `Instagram API error (HTTP ${response.status}, code ${code ?? "?"}/${subcode ?? "?"}) on ${method} ${path}: ${message}`,
      );
    }
    return json as T;
  }

  return {
    async getAccount() {
      if (instagramLogin) {
        const me = await call<{ user_id: string; username: string; account_type: string }>(
          "GET",
          "me?fields=user_id,username,account_type",
        );
        return { userId: me.user_id, username: me.username, accountType: me.account_type };
      }

      const { data: assigned } = await call<{ data: Array<{ id: string; username: string }> }>(
        "GET",
        "me/assigned_instagram_accounts?fields=id,username",
      );
      if (accountId) {
        const match = assigned.find((account) => account.id === accountId);
        if (!match) throw new Error(`INSTAGRAM_ACCOUNT_ID ${accountId} is not one of the accounts this token can use`);
        return { userId: match.id, username: match.username };
      }
      if (assigned.length === 0) {
        throw new Error("This token has no Instagram account assigned. Add the account in the app's Unified login setup.");
      }
      if (assigned.length > 1) {
        const options = assigned.map((account) => `${account.id} (@${account.username})`).join(", ");
        throw new Error(`This token can post to several accounts; set INSTAGRAM_ACCOUNT_ID to one of: ${options}`);
      }
      return { userId: assigned[0]!.id, username: assigned[0]!.username };
    },

    async getPublishingQuota(userId) {
      const { data } = await call<{ data: Array<{ quota_usage?: number; config?: { quota_total?: number } }> }>(
        "GET",
        `${userId}/content_publishing_limit?fields=quota_usage,config`,
      );
      return { used: data[0]?.quota_usage ?? 0, limit: data[0]?.config?.quota_total };
    },

    async createReelContainer(userId, videoUrl, caption, coverUrl) {
      const { id } = await call<{ id: string }>("POST", `${userId}/media`, {
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        share_to_feed: true,
        // Without a cover Instagram uses the first frame, which for these reels is a dark title card.
        ...(coverUrl ? { cover_url: coverUrl } : {}),
      });
      return id;
    },

    async getContainerStatus(containerId) {
      const result = await call<{ status_code: ContainerStatusCode; status?: string }>(
        "GET",
        `${containerId}?fields=status_code,status`,
      );
      return { statusCode: result.status_code, detail: result.status };
    },

    async publishContainer(userId, containerId) {
      const { id } = await call<{ id: string }>("POST", `${userId}/media_publish`, { creation_id: containerId });
      return id;
    },

    async getPermalink(mediaId) {
      const { permalink } = await call<{ permalink?: string }>("GET", `${mediaId}?fields=permalink`);
      return permalink;
    },
  };
}
