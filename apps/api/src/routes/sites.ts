/**
 * Multi-site routes.
 *
 * One blog = one copy of the Notipo Notion template = one WordPress site.
 * Connecting a site wires the copy: Notipo finds the posts database inside the
 * top-level page, writes the reserved Configuration row (key, last sync), and
 * stores the WordPress credentials against the new Site row.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Client } from "@notionhq/client";
import { CredentialService } from "../services/credential.service.js";
import { SiteService } from "../services/site.service.js";
import { NotionService } from "../services/notion.service.js";
import { WordPressService } from "../services/wordpress.service.js";
import {
  bootstrapTemplateCopy,
  lockConfigurationRow,
} from "../lib/site-bootstrap.js";
import { syncWpCategories } from "../lib/sync-wp-categories.js";
import { generateSiteKey } from "../lib/site-config.js";
import { logger } from "../lib/logger.js";
import { captureServer } from "../lib/posthog-server.js";

const createSiteSchema = z.object({
  name: z.string().min(1).max(100),
  notionRootPageId: z.string().min(1),
  wpSiteUrl: z.string().url(),
  username: z.string().min(1),
  appPassword: z.string().min(1),
});

const updateCredentialsSchema = z.object({
  wpSiteUrl: z.string().url(),
  username: z.string().min(1),
  appPassword: z.string().min(1),
});

export async function siteRoutes(app: FastifyInstance) {
  /** GET /api/sites — the tenant's connected blogs */
  app.get("/api/sites", async (request) => {
    const sites = await new SiteService(app.prisma).listSites(request.tenant.id);
    return { data: sites };
  });

  /** GET /api/sites/:id */
  app.get<{ Params: { id: string } }>("/api/sites/:id", async (request, reply) => {
    const site = await new SiteService(app.prisma).getSiteForTenant(
      request.tenant.id,
      request.params.id,
    );
    if (!site) return reply.notFound("Site not found");
    return { data: site };
  });

  /** POST /api/sites — connect a blog (template copy + WordPress) */
  app.post("/api/sites", async (request, reply) => {
    const body = createSiteSchema.parse(request.body);
    const tenantId = request.tenant.id;

    // Verify WordPress before touching Notion
    const wpCreds = {
      siteUrl: body.wpSiteUrl,
      username: body.username,
      appPassword: body.appPassword,
    };
    const wp = new WordPressService(wpCreds);
    try {
      await wp.testConnection();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        return reply.code(400).send({ error: "Invalid WordPress credentials. Check your username and application password." });
      }
      return reply.code(400).send({ error: "Could not connect to WordPress. Check your site URL." });
    }

    // The template copy must already be shared with the Notipo connection
    const credService = new CredentialService(app.prisma);
    const notionCreds = await credService.getNotionCredentials(tenantId);
    if (!notionCreds) {
      return reply.code(400).send({ error: "Notion is not connected" });
    }

    // Notipo generates the keypair and writes the config into the copy
    const key = generateSiteKey();
    let bootstrap: { databaseId: string; configurationRowId: string };
    try {
      bootstrap = await bootstrapTemplateCopy(new Client({ auth: notionCreds.accessToken }), {
        rootPageId: body.notionRootPageId,
        key,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: `Template copy: ${message}` });
    }

    const siteService = new SiteService(app.prisma);
    const site = await siteService.createSite({
      tenantId,
      name: body.name,
      key,
      notionRootPageId: body.notionRootPageId,
      notionDatabaseId: bootstrap.databaseId,
      wpSiteUrl: body.wpSiteUrl,
      wpCredentials: { username: body.username, appPassword: body.appPassword },
    });

    // Detect SEO plugin (best-effort, non-blocking)
    const seoPlugin = await wp.detectSeoPlugin();
    await siteService.updateSiteConfig(site.id, { wpSeoPlugin: seoPlugin });

    // Auto-sync the site's taxonomy (and push options to its Notion database)
    try {
      const notion = new NotionService(notionCreds.accessToken);
      await syncWpCategories(app.prisma, tenantId, site.id, wp, notion, bootstrap.databaseId);
    } catch (e) {
      logger.warn({ err: e, siteId: site.id }, "Failed to sync WP categories after site connect");
    }

    logger.info({ tenantId, siteId: site.id, siteKey: site.key }, "Site connected");
    captureServer({
      distinctId: request.user.id,
      event: "server_site_connected",
      properties: { tenant_id: tenantId, site_id: site.id },
      isImpersonated: request.isAdmin,
    });
    return reply.code(201).send({ data: site });
  });

  /** PUT /api/sites/:id — replace this site's WordPress credentials */
  app.put<{ Params: { id: string } }>("/api/sites/:id", async (request, reply) => {
    const body = updateCredentialsSchema.parse(request.body);
    const siteService = new SiteService(app.prisma);
    const site = await siteService.getSiteForTenant(request.tenant.id, request.params.id);
    if (!site) return reply.notFound("Site not found");

    const wpCreds = {
      siteUrl: body.wpSiteUrl,
      username: body.username,
      appPassword: body.appPassword,
    };
    const wp = new WordPressService(wpCreds);
    try {
      await wp.testConnection();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        return reply.code(400).send({ error: "Invalid WordPress credentials. Check your username and application password." });
      }
      return reply.code(400).send({ error: "Could not connect to WordPress. Check your site URL." });
    }

    await siteService.setWordPressCredentials(site.id, wpCreds);
    const seoPlugin = await wp.detectSeoPlugin();
    await siteService.updateSiteConfig(site.id, { wpSeoPlugin: seoPlugin });

    const updated = await siteService.getById(site.id);
    return { data: updated };
  });

  /** POST /api/sites/:id/health — check the site's WordPress connection */
  app.post<{ Params: { id: string } }>("/api/sites/:id/health", async (request, reply) => {
    const siteService = new SiteService(app.prisma);
    const site = await siteService.getSiteForTenant(request.tenant.id, request.params.id);
    if (!site) return reply.notFound("Site not found");
    const creds = await siteService.getWordPressCredentials(site.id);
    if (!creds) return reply.code(404).send({ error: "WordPress not connected for this site" });

    const wp = new WordPressService(creds);
    try {
      const user = await wp.testConnection();
      const appPassword = await wp.introspectAppPassword();
      return {
        data: {
          connected: true,
          user: user.name,
          appPassword: appPassword
            ? { name: appPassword.name, lastUsed: appPassword.last_used, lastIp: appPassword.last_ip }
            : null,
        },
      };
    } catch {
      return { data: { connected: false, user: null, appPassword: null } };
    }
  });

  /** POST /api/sites/:id/lock — lock the Configuration row after setup */
  app.post<{ Params: { id: string } }>("/api/sites/:id/lock", async (request, reply) => {
    const siteService = new SiteService(app.prisma);
    const site = await siteService.getSiteForTenant(request.tenant.id, request.params.id);
    if (!site) return reply.notFound("Site not found");
    if (!site.notionDatabaseId) {
      return reply.code(400).send({ error: "Site has no Notion template copy" });
    }

    const notionCreds = await new CredentialService(app.prisma).getNotionCredentials(request.tenant.id);
    if (!notionCreds) return reply.code(400).send({ error: "Notion is not connected" });

    try {
      await lockConfigurationRow(new Client({ auth: notionCreds.accessToken }), site.notionDatabaseId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: `Lock failed: ${message}` });
    }
    logger.info({ tenantId: request.tenant.id, siteId: site.id }, "Configuration row locked");
    return reply.code(204).send();
  });

  /**
   * DELETE /api/sites/:id — disconnect the site.
   * Removes the connection record (and its synced posts/mappings) from Notipo;
   * nothing on the customer's WordPress is touched.
   */
  app.delete<{ Params: { id: string } }>("/api/sites/:id", async (request, reply) => {
    const siteService = new SiteService(app.prisma);
    const site = await siteService.getSiteForTenant(request.tenant.id, request.params.id);
    if (!site) return reply.notFound("Site not found");

    await app.prisma.site.delete({ where: { id: site.id } });
    logger.info({ tenantId: request.tenant.id, siteId: site.id }, "Site disconnected");
    captureServer({
      distinctId: request.user.id,
      event: "server_site_disconnected",
      properties: { tenant_id: request.tenant.id, site_id: site.id },
      isImpersonated: request.isAdmin,
    });
    return reply.code(204).send();
  });
}