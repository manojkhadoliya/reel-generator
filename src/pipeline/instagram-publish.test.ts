import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInstagramApi,
  type ContainerStatus,
  type ContainerStatusCode,
  type InstagramApi,
} from "./instagram-api.js";
import {
  prepareInstagramPost,
  publishInstagramPost,
  validateCaption,
  type InstagramDeps,
} from "./instagram-publish.js";
import type { ManifestEntry } from "./manifest.js";

const SLUG = "test-reel";

function setup(statuses: ContainerStatusCode[] = ["FINISHED"]) {
  let manifest: ManifestEntry[] = [
    { slug: SLUG, topic: "Old", s3Url: "s3://b/old.mp4", date: "2026-01-01" },
    { slug: SLUG, topic: "Test", s3Url: "s3://b/new.mp4", date: "2026-01-02" },
  ];
  const queue = [...statuses];
  const api = {
    getAccount: vi.fn(async () => ({ userId: "ig1", username: "reels", accountType: "MEDIA_CREATOR" })),
    getPublishingQuota: vi.fn(),
    createReelContainer: vi.fn(async () => "container1"),
    getContainerStatus: vi.fn(
      async (): Promise<ContainerStatus> => ({ statusCode: queue.length > 1 ? queue.shift()! : queue[0]! }),
    ),
    publishContainer: vi.fn(async () => "media1"),
    getPermalink: vi.fn(async (): Promise<string | undefined> => "https://instagram.com/reel/abc"),
  } satisfies InstagramApi;
  const store = {
    getEtag: vi.fn(async (_s3Url: string): Promise<string> => '"etag1"'),
    getPresignedUrl: vi.fn(async (_s3Url: string): Promise<string> => "https://signed.example/video"),
  };
  const deps: InstagramDeps = {
    api,
    store,
    // Round-trip through JSON so tests catch state that was only mutated, not actually saved.
    loadManifest: async () => JSON.parse(JSON.stringify(manifest)),
    saveManifest: async (entries) => {
      manifest = JSON.parse(JSON.stringify(entries));
    },
    sleep: async () => {},
    now: () => new Date("2026-11-06T00:00:00Z"),
    pollIntervalMs: 1,
    pollTimeoutMs: 5,
  };
  return { api, store, deps, manifest: () => manifest, latest: () => manifest[1]!.instagram };
}

describe("prepareInstagramPost", () => {
  it("records a draft on the newest entry for the slug without posting anything", async () => {
    const { api, deps, manifest, latest } = setup();
    const draft = await prepareInstagramPost(deps, SLUG, "caption");

    expect(draft).toMatchObject({ account: "reels", caption: "caption", previewUrl: "https://signed.example/video" });
    expect(latest()).toMatchObject({ status: "pending_approval", etag: '"etag1"', account: "reels" });
    expect(manifest()[0]!.instagram).toBeUndefined();
    expect(api.createReelContainer).not.toHaveBeenCalled();
    expect(api.publishContainer).not.toHaveBeenCalled();
  });

  it("does not persist the presigned URL to the committed manifest", async () => {
    const { deps, manifest } = setup();
    await prepareInstagramPost(deps, SLUG, "caption");
    expect(JSON.stringify(manifest())).not.toContain("signed.example");
  });

  it("refuses an unknown slug", async () => {
    await expect(prepareInstagramPost(setup().deps, "nope", "caption")).rejects.toThrow("No reel");
  });

  it("refuses to redraft a reel whose earlier publish went out despite a lost response", async () => {
    const { api, deps, latest } = setup(["PUBLISHED"]);
    const { code } = await prepareInstagramPost(deps, SLUG, "caption");
    api.publishContainer.mockRejectedValueOnce(new Error("timeout"));
    api.getContainerStatus.mockResolvedValueOnce({ statusCode: "FINISHED" });
    await publishInstagramPost(deps, SLUG, code).catch(() => {});

    await expect(prepareInstagramPost(deps, SLUG, "new caption")).rejects.toThrow("already published");
    expect(latest()!.status).toBe("published");
    expect(latest()!.caption).toBe("caption");
  });
});

describe("publishInstagramPost approval gate", () => {
  it("refuses a reel that was never prepared", async () => {
    const { api, deps } = setup();
    await expect(publishInstagramPost(deps, SLUG, "abc")).rejects.toThrow("no Instagram draft");
    expect(api.createReelContainer).not.toHaveBeenCalled();
  });

  it("refuses a wrong code", async () => {
    const { api, deps } = setup();
    await prepareInstagramPost(deps, SLUG, "caption");
    await expect(publishInstagramPost(deps, SLUG, "wrong")).rejects.toThrow("does not match");
    expect(api.createReelContainer).not.toHaveBeenCalled();
  });

  it("voids the code when the caption is re-prepared", async () => {
    const { api, deps } = setup();
    const { code } = await prepareInstagramPost(deps, SLUG, "caption");
    await prepareInstagramPost(deps, SLUG, "different caption");
    await expect(publishInstagramPost(deps, SLUG, code)).rejects.toThrow("does not match");
    expect(api.createReelContainer).not.toHaveBeenCalled();
  });

  it("voids the code when the caption is edited directly in the manifest", async () => {
    const { deps, manifest } = setup();
    const { code } = await prepareInstagramPost(deps, SLUG, "caption");
    manifest()[1]!.instagram!.caption = "edited";
    await expect(publishInstagramPost(deps, SLUG, code)).rejects.toThrow("does not match");
  });

  it("refuses when the video was overwritten after the preview", async () => {
    const { api, store, deps } = setup();
    const { code } = await prepareInstagramPost(deps, SLUG, "caption");
    store.getEtag.mockResolvedValue('"etag2"');
    await expect(publishInstagramPost(deps, SLUG, code)).rejects.toThrow("changed");
    expect(api.createReelContainer).not.toHaveBeenCalled();
  });

  it("refuses when the cover was replaced after the preview", async () => {
    const { api, store, deps } = setup();
    const { code } = await prepareInstagramPost(deps, SLUG, "caption", "s3://b/new-cover.jpg");
    store.getEtag.mockImplementation(async (url: string) => (url.endsWith("cover.jpg") ? '"cover2"' : '"etag1"'));
    await expect(publishInstagramPost(deps, SLUG, code)).rejects.toThrow("cover in S3 changed");
    expect(api.createReelContainer).not.toHaveBeenCalled();
  });

  it("gives a draft with a cover a different code than the same draft without one", async () => {
    const { deps } = setup();
    const withoutCover = await prepareInstagramPost(deps, SLUG, "caption");
    const withCover = await prepareInstagramPost(deps, SLUG, "caption", "s3://b/new-cover.jpg");
    expect(withCover.code).not.toBe(withoutCover.code);
    await expect(publishInstagramPost(deps, SLUG, withoutCover.code)).rejects.toThrow("does not match");
  });

  it("refuses when the token now belongs to a different account", async () => {
    const { api, deps } = setup();
    const { code } = await prepareInstagramPost(deps, SLUG, "caption");
    api.getAccount.mockResolvedValue({ userId: "ig2", username: "other", accountType: "BUSINESS" });
    await expect(publishInstagramPost(deps, SLUG, code)).rejects.toThrow("@other");
    expect(api.createReelContainer).not.toHaveBeenCalled();
  });
});

describe("publishInstagramPost flow", () => {
  let ctx: ReturnType<typeof setup>;
  let code: string;

  async function prepared(statuses: ContainerStatusCode[]) {
    ctx = setup(statuses);
    code = (await prepareInstagramPost(ctx.deps, SLUG, "caption")).code;
  }

  beforeEach(() => prepared(["IN_PROGRESS", "FINISHED"]));

  it("creates a container from the presigned URL, waits, publishes, and records the result", async () => {
    const result = await publishInstagramPost(ctx.deps, SLUG, code);

    expect(ctx.api.createReelContainer).toHaveBeenCalledWith("ig1", "https://signed.example/video", "caption", undefined);
    expect(ctx.api.publishContainer).toHaveBeenCalledWith("ig1", "container1");
    expect(result).toEqual({ mediaId: "media1", permalink: "https://instagram.com/reel/abc" });
    expect(ctx.latest()).toMatchObject({
      status: "published",
      mediaId: "media1",
      permalink: "https://instagram.com/reel/abc",
      publishedAt: "2026-11-06T00:00:00.000Z",
    });
  });

  it("sends the approved cover as a presigned URL and records it in the draft", async () => {
    ctx = setup(["FINISHED"]);
    ctx.store.getPresignedUrl.mockImplementation(async (url: string) => `https://signed.example/${url.split("/").at(-1)}`);
    const draft = await prepareInstagramPost(ctx.deps, SLUG, "caption", "s3://b/new-cover.jpg");
    expect(draft.coverPreviewUrl).toBe("https://signed.example/new-cover.jpg");
    expect(ctx.latest()).toMatchObject({ coverS3Url: "s3://b/new-cover.jpg", coverEtag: '"etag1"' });

    await publishInstagramPost(ctx.deps, SLUG, draft.code);
    expect(ctx.api.createReelContainer).toHaveBeenCalledWith(
      "ig1",
      "https://signed.example/new.mp4",
      "caption",
      "https://signed.example/new-cover.jpg",
    );
  });

  it("refuses to publish the same reel twice", async () => {
    await publishInstagramPost(ctx.deps, SLUG, code);
    await expect(publishInstagramPost(ctx.deps, SLUG, code)).rejects.toThrow("already published");
    expect(ctx.api.publishContainer).toHaveBeenCalledTimes(1);
  });

  it("does not post again when a retry finds the lost-response publish already went out", async () => {
    await prepared(["FINISHED"]);
    ctx.api.publishContainer.mockRejectedValueOnce(new Error("timeout"));
    await expect(publishInstagramPost(ctx.deps, SLUG, code)).rejects.toThrow("timeout");
    expect(ctx.latest()!.containerId).toBe("container1");

    ctx.api.getContainerStatus.mockResolvedValue({ statusCode: "PUBLISHED" });
    await publishInstagramPost(ctx.deps, SLUG, code);

    expect(ctx.api.createReelContainer).toHaveBeenCalledTimes(1);
    expect(ctx.api.publishContainer).toHaveBeenCalledTimes(1);
    expect(ctx.latest()!.status).toBe("published");
  });

  it("reuses the saved container after a timeout instead of creating another", async () => {
    await prepared(["IN_PROGRESS"]);
    await expect(publishInstagramPost(ctx.deps, SLUG, code)).rejects.toThrow("still processing");

    ctx.api.getContainerStatus.mockResolvedValue({ statusCode: "FINISHED" });
    await publishInstagramPost(ctx.deps, SLUG, code);

    expect(ctx.api.createReelContainer).toHaveBeenCalledTimes(1);
    expect(ctx.api.publishContainer).toHaveBeenCalledTimes(1);
  });

  it("surfaces Instagram's processing error and starts a fresh container on retry", async () => {
    await prepared(["ERROR"]);
    ctx.api.getContainerStatus.mockResolvedValueOnce({ statusCode: "ERROR", detail: "bad codec" });
    await expect(publishInstagramPost(ctx.deps, SLUG, code)).rejects.toThrow("bad codec");
    expect(ctx.latest()!.containerId).toBeUndefined();
    expect(ctx.latest()!.status).toBe("pending_approval");

    ctx.api.getContainerStatus.mockResolvedValue({ statusCode: "FINISHED" });
    await publishInstagramPost(ctx.deps, SLUG, code);
    expect(ctx.api.createReelContainer).toHaveBeenCalledTimes(2);
  });

  it("replaces an expired container on retry", async () => {
    await prepared(["FINISHED"]);
    ctx.api.publishContainer.mockRejectedValueOnce(new Error("timeout"));
    await publishInstagramPost(ctx.deps, SLUG, code).catch(() => {});

    ctx.api.getContainerStatus.mockResolvedValueOnce({ statusCode: "EXPIRED" });
    await publishInstagramPost(ctx.deps, SLUG, code);
    expect(ctx.api.createReelContainer).toHaveBeenCalledTimes(2);
  });

  it("rides out transient status-check failures", async () => {
    ctx.api.getContainerStatus.mockRejectedValueOnce(new Error("blip"));
    await publishInstagramPost(ctx.deps, SLUG, code);
    expect(ctx.api.publishContainer).toHaveBeenCalledTimes(1);
  });

  it("keeps the container when status checks keep failing, so a re-run resumes it", async () => {
    ctx.api.getContainerStatus.mockRejectedValue(new Error("network down"));
    await expect(publishInstagramPost(ctx.deps, SLUG, code)).rejects.toThrow("network down");
    expect(ctx.latest()!.containerId).toBe("container1");
    expect(ctx.api.publishContainer).not.toHaveBeenCalled();
  });

  it("still reports success when only the permalink lookup fails", async () => {
    ctx.api.getPermalink.mockRejectedValueOnce(new Error("blip"));
    const result = await publishInstagramPost(ctx.deps, SLUG, code);
    expect(result).toEqual({ mediaId: "media1", permalink: undefined });
    expect(ctx.latest()!.status).toBe("published");
  });
});

describe("validateCaption", () => {
  it("accepts a caption at the limits", () => {
    expect(() => validateCaption("a".repeat(2200))).not.toThrow();
    expect(() => validateCaption(Array.from({ length: 30 }, (_, i) => `#t${i}`).join(" "))).not.toThrow();
  });

  it("rejects empty, overlong, and over-tagged captions", () => {
    expect(() => validateCaption("  ")).toThrow("empty");
    expect(() => validateCaption("a".repeat(2201))).toThrow("2201");
    expect(() => validateCaption(Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" "))).toThrow("31 hashtags");
  });

  it("limits @ tags to 20 without counting email addresses", () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `@user${i}`).join(" ");
    expect(() => validateCaption(`${tags(20)} mail me@example.com`)).not.toThrow();
    expect(() => validateCaption(tags(21))).toThrow("21 @ tags");
  });
});

describe("createInstagramApi", () => {
  function apiWith(respond: () => Promise<Response>) {
    const fetchImpl = vi.fn(respond);
    return { fetchImpl, api: createInstagramApi({ accessToken: "IGsecret-token", fetchImpl: fetchImpl as typeof fetch }) };
  }

  it("sends a reel container request with the token in a header, not the URL", async () => {
    const { api, fetchImpl } = apiWith(async () => new Response(JSON.stringify({ id: "c1" })));
    await expect(api.createReelContainer("ig1", "https://signed/v?a=1&b=2", "hello")).resolves.toBe("c1");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.instagram.com/v24.0/ig1/media");
    expect(url).not.toContain("IGsecret-token");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer IGsecret-token");
    expect(JSON.parse(init.body as string)).toEqual({
      media_type: "REELS",
      video_url: "https://signed/v?a=1&b=2",
      caption: "hello",
      share_to_feed: true,
    });
  });

  it("sends system-user tokens to graph.facebook.com and finds the assigned account", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ data: [{ id: "178", username: "stack.future" }] })),
    );
    const api = createInstagramApi({ accessToken: "EAAsecret", fetchImpl: fetchImpl as typeof fetch });
    await expect(api.getAccount()).resolves.toEqual({ userId: "178", username: "stack.future" });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://graph.facebook.com/v24.0/me/assigned_instagram_accounts?fields=id,username");
  });

  it("makes a system-user token with several accounts name one explicitly", async () => {
    const accounts = { data: [{ id: "1", username: "a" }, { id: "2", username: "b" }] };
    const make = (accountId?: string) =>
      createInstagramApi({
        accessToken: "EAAsecret",
        accountId,
        fetchImpl: (async () => new Response(JSON.stringify(accounts))) as typeof fetch,
      });
    await expect(make().getAccount()).rejects.toThrow("set INSTAGRAM_ACCOUNT_ID to one of: 1 (@a), 2 (@b)");
    await expect(make("2").getAccount()).resolves.toEqual({ userId: "2", username: "b" });
    await expect(make("3").getAccount()).rejects.toThrow("not one of the accounts");
  });

  it("explains a system-user token with no assigned account", async () => {
    const api = createInstagramApi({
      accessToken: "EAAsecret",
      fetchImpl: (async () => new Response(JSON.stringify({ data: [] }))) as typeof fetch,
    });
    await expect(api.getAccount()).rejects.toThrow("no Instagram account assigned");
  });

  it("sends cover_url only when a cover is given", async () => {
    const { api, fetchImpl } = apiWith(async () => new Response(JSON.stringify({ id: "c1" })));
    await api.createReelContainer("ig1", "https://v", "hi", "https://cover");
    await api.createReelContainer("ig1", "https://v", "hi");
    const bodies = fetchImpl.mock.calls.map((call) => JSON.parse((call as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0].cover_url).toBe("https://cover");
    expect(bodies[1]).not.toHaveProperty("cover_url");
  });

  it("maps Instagram's account and status response fields", async () => {
    const account = apiWith(
      async () => new Response(JSON.stringify({ user_id: "1", username: "u", account_type: "BUSINESS" })),
    );
    await expect(account.api.getAccount()).resolves.toEqual({ userId: "1", username: "u", accountType: "BUSINESS" });

    const status = apiWith(async () => new Response(JSON.stringify({ status_code: "ERROR", status: "bad" })));
    await expect(status.api.getContainerStatus("c1")).resolves.toEqual({ statusCode: "ERROR", detail: "bad" });
  });

  it("surfaces Instagram's error message and code", async () => {
    const { api } = apiWith(
      async () => new Response(JSON.stringify({ error: { message: "Token expired", code: 190 } }), { status: 400 }),
    );
    await expect(api.getAccount()).rejects.toThrow(/HTTP 400, code 190.*Token expired/);
  });

  it("names the network cause and never echoes the token", async () => {
    const { api } = apiWith(async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    });
    const error: Error = await api.getAccount().catch((e) => e);
    expect(error.message).toContain("ENOTFOUND");
    expect(error.message).not.toContain("IGsecret-token");
  });

  it("reports a non-JSON response clearly", async () => {
    const { api } = apiWith(async () => new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(api.getAccount()).rejects.toThrow("non-JSON response (HTTP 502)");
  });
});
