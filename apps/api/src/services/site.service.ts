/**
 * Site registry.
 *
 * One Site row per Notion template copy = one WordPress site. Each copy is a
 * top-level teamspace page whose posts database carries a reserved
 * "Configuration" row (see lib/site-config.ts). Posts, categories, tags and
 * image mappings are scoped by siteId.
 */

import type { PrismaClient } from "@prisma/client";
import { encryptJson, decryptJson } from "../lib/encryption.js";
import { generateSiteKey } from "../lib/site-config.js";

export interface SiteWordPressCredentials {
  siteUrl: string;
  username: string;
  appPassword: string;
}

/** Non-secret view of a Site row — never includes credentials. */
export interface SiteRecord {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  notionRootPageId: string | null;
  notionDatabaseId: string | null;
  wpSiteUrl: string | null;
  wpSeoPlugin: string | null;
  hasCredentials: boolean;
}

export interface CreateSiteInput {
  tenantId: string;
  name: string;
  key?: string;
  notionRootPageId?: string | null;
  notionDatabaseId?: string | null;
  wpSiteUrl: string;
  wpCredentials: { username: string; appPassword: string };
}

interface SiteRow {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  notionRootPageId: string | null;
  notionDatabaseId: string | null;
  wpSiteUrl: string | null;
  wpSeoPlugin: string | null;
  wordpressCredentials?: string | null;
}

function toSiteRecord(row: SiteRow): SiteRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    key: row.key,
    name: row.name,
    notionRootPageId: row.notionRootPageId,
    notionDatabaseId: row.notionDatabaseId,
    wpSiteUrl: row.wpSiteUrl,
    wpSeoPlugin: row.wpSeoPlugin,
    hasCredentials: row.wordpressCredentials != null,
  };
}

export class SiteService {
  constructor(private prisma: PrismaClient) {}

  async createSite(input: CreateSiteInput): Promise<SiteRecord> {
    const credentials: SiteWordPressCredentials = {
      siteUrl: input.wpSiteUrl,
      username: input.wpCredentials.username,
      appPassword: input.wpCredentials.appPassword,
    };
    const row = (await this.prisma.site.create({
      data: {
        tenantId: input.tenantId,
        key: input.key ?? generateSiteKey(),
        name: input.name,
        notionRootPageId: input.notionRootPageId ?? null,
        notionDatabaseId: input.notionDatabaseId ?? null,
        wpSiteUrl: input.wpSiteUrl,
        wordpressCredentials: encryptJson(
          credentials as unknown as Record<string, unknown>,
        ),
      },
    })) as SiteRow;

    return toSiteRecord(row);
  }

  async findByNotionDatabaseId(
    tenantId: string,
    notionDatabaseId: string,
  ): Promise<SiteRecord | null> {
    const row = (await this.prisma.site.findFirst({
      where: { tenantId, notionDatabaseId },
    })) as SiteRow | null;
    return row ? toSiteRecord(row) : null;
  }

  async getByKey(key: string): Promise<SiteRecord | null> {
    const row = (await this.prisma.site.findUnique({
      where: { key },
    })) as SiteRow | null;
    return row ? toSiteRecord(row) : null;
  }

  async getById(siteId: string): Promise<SiteRecord | null> {
    const row = (await this.prisma.site.findUnique({
      where: { id: siteId },
    })) as SiteRow | null;
    return row ? toSiteRecord(row) : null;
  }

  /** Tenant-checked lookup — use for anything reachable from an HTTP route. */
  async getSiteForTenant(
    tenantId: string,
    siteId: string,
  ): Promise<SiteRecord | null> {
    const row = (await this.prisma.site.findFirst({
      where: { id: siteId, tenantId },
    })) as SiteRow | null;
    return row ? toSiteRecord(row) : null;
  }

  /** The tenant's first-created site — legacy single-site behavior. */
  async getDefaultSite(tenantId: string): Promise<SiteRecord | null> {
    const row = (await this.prisma.site.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    })) as SiteRow | null;
    return row ? toSiteRecord(row) : null;
  }

  async updateSiteConfig(
    siteId: string,
    config: { wpSeoPlugin?: string | null },
  ): Promise<void> {
    await this.prisma.site.update({
      where: { id: siteId },
      data: { wpSeoPlugin: config.wpSeoPlugin ?? null },
    });
  }

  async listSites(tenantId: string): Promise<SiteRecord[]> {
    const rows = (await this.prisma.site.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    })) as SiteRow[];
    return rows.map(toSiteRecord);
  }

  async getWordPressCredentials(
    siteId: string,
  ): Promise<SiteWordPressCredentials | null> {
    const row = (await this.prisma.site.findUnique({
      where: { id: siteId },
    })) as SiteRow | null;
    if (!row?.wordpressCredentials) return null;
    return decryptJson<SiteWordPressCredentials>(row.wordpressCredentials);
  }

  async setWordPressCredentials(
    siteId: string,
    creds: SiteWordPressCredentials,
  ): Promise<void> {
    await this.prisma.site.update({
      where: { id: siteId },
      data: {
        wordpressCredentials: encryptJson(
          creds as unknown as Record<string, unknown>,
        ),
        wpSiteUrl: creds.siteUrl,
      },
    });
  }
}