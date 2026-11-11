import { afterEach, describe, expect, it, vi } from "vitest";

function stubBaseEnv() {
  vi.stubEnv("DATABASE_URL", "postgresql://notipo:***@localhost:5432/notipo");
  vi.stubEnv("ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("API_KEY", "test-admin-key");
  vi.stubEnv("NODE_ENV", "test");
}

async function loadSiteService() {
  vi.resetModules();
  stubBaseEnv();
  return import("../../src/services/site.service.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const createInput = {
  tenantId: "tenant_1",
  name: "Crown Trophy",
  notionRootPageId: "root-page-1",
  notionDatabaseId: "db-1",
  wpSiteUrl: "https://crowntrophy.example",
  wpCredentials: { username: "bot", appPassword: "app-pass" },
};

describe("SiteService.createSite", () => {
  it("creates a site with a caller-provided key when given", async () => {
    const { SiteService } = await loadSiteService();
    const create = vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "site_1",
      ...args.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const prisma = { site: { create } };

    const site = await new SiteService(prisma as never).createSite({
      ...createInput,
      key: "npk_pre-generated",
    });

    expect(site.key).toBe("npk_pre-generated");
    expect(create.mock.calls[0][0].data.key).toBe("npk_pre-generated");
  });

  it("creates a site with a generated key and encrypted credentials", async () => {
    const { SiteService } = await loadSiteService();
    const { decryptJson } = await import("../../src/lib/encryption.js");
    const create = vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "site_1",
      ...args.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const prisma = { site: { create } };

    const site = await new SiteService(prisma as never).createSite(createInput);

    expect(site.key).toMatch(/^npk_[A-Za-z0-9_-]{24,}$/);
    expect(site.notionRootPageId).toBe("root-page-1");
    expect(site.notionDatabaseId).toBe("db-1");
    expect(site.wpSiteUrl).toBe("https://crowntrophy.example");
    expect(create).toHaveBeenCalledTimes(1);
    const stored = create.mock.calls[0][0].data;
    expect(decryptJson(stored.wordpressCredentials)).toEqual({
      siteUrl: "https://crowntrophy.example",
      username: "bot",
      appPassword: "app-pass",
    });
    expect(JSON.stringify(site)).not.toContain("app-pass");
  });
});

describe("SiteService lookups", () => {
  it("finds a site by its posts database ID within the tenant", async () => {
    const { SiteService } = await loadSiteService();
    const findFirst = vi.fn().mockResolvedValue({
      id: "site_1",
      tenantId: "tenant_1",
      key: "npk_abc",
      name: "Crown Trophy",
      notionRootPageId: "root-page-1",
      notionDatabaseId: "db-1",
      wpSiteUrl: "https://crowntrophy.example",
      wpSeoPlugin: "rankmath",
    });
    const prisma = { site: { findFirst } };

    const site = await new SiteService(prisma as never).findByNotionDatabaseId(
      "tenant_1",
      "db-1",
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1", notionDatabaseId: "db-1" },
    });
    expect(site).not.toBeNull();
    expect(site?.id).toBe("site_1");
  });

  it("returns null when no site matches the database ID", async () => {
    const { SiteService } = await loadSiteService();
    const prisma = { site: { findFirst: vi.fn().mockResolvedValue(null) } };

    const site = await new SiteService(prisma as never).findByNotionDatabaseId(
      "tenant_1",
      "unknown-db",
    );

    expect(site).toBeNull();
  });

  it("finds a site by its Notipo key", async () => {
    const { SiteService } = await loadSiteService();
    const findUnique = vi.fn().mockResolvedValue({
      id: "site_1",
      tenantId: "tenant_1",
      key: "npk_abc",
      name: "Crown Trophy",
      notionRootPageId: "root-page-1",
      notionDatabaseId: "db-1",
      wpSiteUrl: "https://crowntrophy.example",
      wpSeoPlugin: null,
    });
    const prisma = { site: { findUnique } };

    const site = await new SiteService(prisma as never).getByKey("npk_abc");

    expect(findUnique).toHaveBeenCalledWith({ where: { key: "npk_abc" } });
    expect(site?.id).toBe("site_1");
  });

  it("lists a tenant's sites without leaking credentials", async () => {
    const { SiteService } = await loadSiteService();
    const { encryptJson } = await import("../../src/lib/encryption.js");
    const prisma = {
      site: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "site_1",
            tenantId: "tenant_1",
            key: "npk_abc",
            name: "Crown Trophy",
            notionRootPageId: "root-page-1",
            notionDatabaseId: "db-1",
            wpSiteUrl: "https://crowntrophy.example",
            wpSeoPlugin: null,
            wordpressCredentials: encryptJson({
              siteUrl: "https://crowntrophy.example",
              username: "bot",
              appPassword: "super-secret",
            }),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
    };

    const sites = await new SiteService(prisma as never).listSites("tenant_1");

    expect(sites).toHaveLength(1);
    expect(sites[0]?.key).toBe("npk_abc");
    expect(sites[0]?.hasCredentials).toBe(true);
    expect(JSON.stringify(sites)).not.toContain("super-secret");
  });
});

describe("SiteService additional lookups", () => {
  it("gets a site by id without leaking credentials", async () => {
    const { SiteService } = await loadSiteService();
    const { encryptJson } = await import("../../src/lib/encryption.js");
    const findUnique = vi.fn().mockResolvedValue({
      id: "site_1",
      tenantId: "tenant_1",
      key: "npk_abc",
      name: "Crown Trophy",
      notionRootPageId: "root-page-1",
      notionDatabaseId: "db-1",
      wpSiteUrl: "https://crowntrophy.example",
      wpSeoPlugin: null,
      wordpressCredentials: encryptJson({
        siteUrl: "https://crowntrophy.example",
        username: "bot",
        appPassword: "leaky-secret",
      }),
    });
    const prisma = { site: { findUnique } };

    const site = await new SiteService(prisma as never).getById("site_1");

    expect(findUnique).toHaveBeenCalledWith({ where: { id: "site_1" } });
    expect(site?.id).toBe("site_1");
    expect(JSON.stringify(site)).not.toContain("leaky-secret");
  });

  it("resolves the tenant's default (first) site", async () => {
    const { SiteService } = await loadSiteService();
    const findFirst = vi.fn().mockResolvedValue({
      id: "site_1",
      tenantId: "tenant_1",
      key: "npk_abc",
      name: "Crown Trophy",
      notionRootPageId: "root-page-1",
      notionDatabaseId: "db-1",
      wpSiteUrl: "https://crowntrophy.example",
      wpSeoPlugin: null,
    });
    const prisma = { site: { findFirst } };

    const site = await new SiteService(prisma as never).getDefaultSite("tenant_1");

    expect(findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1" },
      orderBy: { createdAt: "asc" },
    });
    expect(site?.id).toBe("site_1");
  });

  it("gets a site only within its own tenant", async () => {
    const { SiteService } = await loadSiteService();
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { site: { findFirst } };

    const site = await new SiteService(prisma as never).getSiteForTenant(
      "tenant_other",
      "site_1",
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "site_1", tenantId: "tenant_other" },
    });
    expect(site).toBeNull();
  });

  it("updates site config fields such as the SEO plugin", async () => {
    const { SiteService } = await loadSiteService();
    const update = vi.fn().mockResolvedValue({});
    const prisma = { site: { update } };

    await new SiteService(prisma as never).updateSiteConfig("site_1", {
      wpSeoPlugin: "rankmath",
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "site_1" },
      data: { wpSeoPlugin: "rankmath" },
    });
  });
});

describe("SiteService credentials", () => {
  it("decrypts the site's WordPress credentials", async () => {
    const { SiteService } = await loadSiteService();
    const { encryptJson } = await import("../../src/lib/encryption.js");
    const prisma = {
      site: {
        findUnique: vi.fn().mockResolvedValue({
          wordpressCredentials: encryptJson({
            siteUrl: "https://crowntrophy.example",
            username: "bot",
            appPassword: "app-pass",
          }),
        }),
      },
    };

    const creds = await new SiteService(prisma as never).getWordPressCredentials("site_1");

    expect(creds).toEqual({
      siteUrl: "https://crowntrophy.example",
      username: "bot",
      appPassword: "app-pass",
    });
  });

  it("returns null when the site has no credentials", async () => {
    const { SiteService } = await loadSiteService();
    const prisma = { site: { findUnique: vi.fn().mockResolvedValue({ wordpressCredentials: null }) } };

    const creds = await new SiteService(prisma as never).getWordPressCredentials("site_1");

    expect(creds).toBeNull();
  });

  it("replaces credentials and mirrors the site URL", async () => {
    const { SiteService } = await loadSiteService();
    const { decryptJson } = await import("../../src/lib/encryption.js");
    const update = vi.fn().mockResolvedValue({});
    const prisma = { site: { update } };

    await new SiteService(prisma as never).setWordPressCredentials("site_1", {
      siteUrl: "https://newblog.example",
      username: "bot2",
      appPassword: "new-pass",
    });

    const data = update.mock.calls[0][0].data;
    expect(data.wpSiteUrl).toBe("https://newblog.example");
    expect(decryptJson(data.wordpressCredentials)).toEqual({
      siteUrl: "https://newblog.example",
      username: "bot2",
      appPassword: "new-pass",
    });
  });
});