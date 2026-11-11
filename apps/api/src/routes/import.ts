import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CredentialService } from "../services/credential.service.js";
import { SiteService } from "../services/site.service.js";
import { WordPressService } from "../services/wordpress.service.js";
import { canImportFromWordPress } from "../lib/plan-limits.js";

const importSingleSchema = z.object({
  siteId: z.string().optional(),
  wpPostId: z.number().int().positive(),
  overwrite: z.boolean().optional().default(false),
});

const importAllSchema = z.object({
  siteId: z.string().optional(),
  status: z.string().optional().default("any"),
  overwrite: z.boolean().optional().default(false),
});

const importBulkSchema = z.object({
  siteId: z.string().optional(),
  wpPostIds: z.array(z.number().int().positive()).min(1).max(200),
  overwrite: z.boolean().optional().default(false),
});

/**
 * Import writes into Notion, so both the connection and the target database must
 * exist before a job is worth queuing. Without this the job dies in the worker
 * (import.service.ts) and the user only finds out from the Jobs page.
 * Returns a user-facing message, or null when Notion is ready.
 */
async function notionImportBlocker(app: FastifyInstance, tenantId: string, notionDatabaseId: string | null) {
  const credService = new CredentialService(app.prisma);
  const notionCreds = await credService.getNotionCredentials(tenantId);
  if (!notionCreds) return "Notion not connected";
  if (!notionDatabaseId) return "Notion database not configured";
  return null;
}

export async function importRoutes(app: FastifyInstance) {
  /** GET /api/import/wp-posts — List importable WordPress posts */
  app.get<{ Querystring: { siteId?: string; page?: string; perPage?: string; status?: string } }>(
    "/api/import/wp-posts",
    async (request, reply) => {
      const tenantId = request.tenant.id;

      // Plan gate
      const tenant = await app.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { plan: true, trialEndsAt: true, notionDatabaseId: true },
      });
      if (!canImportFromWordPress(tenant.plan, tenant.trialEndsAt)) {
        return reply.code(403).send({ error: "Import from WordPress requires a Pro plan" });
      }

      const siteService = new SiteService(app.prisma);
      const site = request.query.siteId
        ? await siteService.getSiteForTenant(tenantId, request.query.siteId)
        : await siteService.getDefaultSite(tenantId);
      const wpCreds = site ? await siteService.getWordPressCredentials(site.id) : null;
      if (!site || !wpCreds) {
        return reply.code(400).send({ error: "WordPress not connected for this site" });
      }

      // Reported, not enforced: the list is still useful to browse, but the UI
      // needs to know it cannot import yet.
      const notionIssue = await notionImportBlocker(app, tenantId, site.notionDatabaseId);

      const wp = new WordPressService(wpCreds);
      const page = Number(request.query.page) || 1;
      const perPage = Math.min(Number(request.query.perPage) || 20, 100);
      const status = request.query.status || "any";

      const result = await wp.listPosts({ status, page, perPage });

      // Find which posts are already imported
      const wpPostIds = result.posts.map((p) => p.id);
      const existing = await app.prisma.post.findMany({
        where: { siteId: site.id, wpPostId: { in: wpPostIds } },
        select: { wpPostId: true },
      });
      const importedIds = existing.map((p) => p.wpPostId).filter(Boolean) as number[];

      return {
        data: result.posts.map((p) => ({
          id: p.id,
          title: p.title.rendered,
          status: p.status,
          slug: p.slug,
          date: p.date,
          link: p.link,
          categories: p.categories,
          tags: p.tags,
          imported: importedIds.includes(p.id),
        })),
        total: result.total,
        totalPages: result.totalPages,
        page,
        perPage,
        notionIssue,
      };
    },
  );

  /** POST /api/import/posts/all — Paginate all WP posts and import every one */
  app.post("/api/import/posts/all", async (request, reply) => {
    const tenantId = request.tenant.id;
    const body = importAllSchema.parse(request.body);

    const tenant = await app.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { plan: true, trialEndsAt: true, notionDatabaseId: true },
    });
    if (!canImportFromWordPress(tenant.plan, tenant.trialEndsAt)) {
      return reply.code(403).send({ error: "Import from WordPress requires a Pro plan" });
    }

    const notionIssue = await notionImportBlocker(app, tenantId, tenant.notionDatabaseId);
    if (notionIssue) return reply.code(400).send({ error: notionIssue });

    const siteService = new SiteService(app.prisma);
    const site = body.siteId
      ? await siteService.getSiteForTenant(tenantId, body.siteId)
      : await siteService.getDefaultSite(tenantId);
    const wpCreds = site ? await siteService.getWordPressCredentials(site.id) : null;
    if (!site || !wpCreds) return reply.code(400).send({ error: "WordPress not connected for this site" });

    const wp = new WordPressService(wpCreds);
    const [cats, tags] = await Promise.all([wp.listCategories(), wp.listTags()]);
    const wpCategoryMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
    const wpTagMap = Object.fromEntries(tags.map((t) => [t.id, t.name]));

    // Paginate through all WP posts
    const wpPostIds: number[] = [];
    let page = 1;
    while (true) {
      const result = await wp.listPosts({ status: body.status, page, perPage: 100 });
      wpPostIds.push(...result.posts.map((p) => p.id));
      if (page >= result.totalPages || result.posts.length === 0) break;
      page++;
    }

    for (const wpPostId of wpPostIds) {
      await app.boss.send("import-post", {
        tenantId,
        siteId: site.id,
        wpPostId,
        overwrite: body.overwrite,
        wpCategoryMap,
        wpTagMap,
      }, { singletonKey: `import:${site.id}:${wpPostId}` });
    }

    return reply.code(202).send({
      data: { count: wpPostIds.length, message: "All import jobs queued" },
    });
  });

  /** POST /api/import/posts — Import a single WordPress post */
  app.post("/api/import/posts", async (request, reply) => {
    const tenantId = request.tenant.id;
    const body = importSingleSchema.parse(request.body);

    const tenant = await app.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { plan: true, trialEndsAt: true, notionDatabaseId: true },
    });
    if (!canImportFromWordPress(tenant.plan, tenant.trialEndsAt)) {
      return reply.code(403).send({ error: "Import from WordPress requires a Pro plan" });
    }

    const notionIssue = await notionImportBlocker(app, tenantId, tenant.notionDatabaseId);
    if (notionIssue) return reply.code(400).send({ error: notionIssue });

    const siteService = new SiteService(app.prisma);
    const site = body.siteId
      ? await siteService.getSiteForTenant(tenantId, body.siteId)
      : await siteService.getDefaultSite(tenantId);
    if (!site) return reply.code(400).send({ error: "No site connected" });

    const jobId = await app.boss.send("import-post", {
      tenantId,
      siteId: site.id,
      wpPostId: body.wpPostId,
      overwrite: body.overwrite,
    }, { singletonKey: `import:${site.id}:${body.wpPostId}` });

    return reply.code(202).send({
      data: { jobId, wpPostId: body.wpPostId, message: "Import job queued" },
    });
  });

  /** POST /api/import/posts/bulk — Import multiple WordPress posts */
  app.post("/api/import/posts/bulk", async (request, reply) => {
    const tenantId = request.tenant.id;
    const body = importBulkSchema.parse(request.body);

    const tenant = await app.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { plan: true, trialEndsAt: true, notionDatabaseId: true },
    });
    if (!canImportFromWordPress(tenant.plan, tenant.trialEndsAt)) {
      return reply.code(403).send({ error: "Import from WordPress requires a Pro plan" });
    }

    const notionIssue = await notionImportBlocker(app, tenantId, tenant.notionDatabaseId);
    if (notionIssue) return reply.code(400).send({ error: notionIssue });

    // Pre-resolve WP categories/tags once for efficiency
    const siteService = new SiteService(app.prisma);
    const site = body.siteId
      ? await siteService.getSiteForTenant(tenantId, body.siteId)
      : await siteService.getDefaultSite(tenantId);
    const wpCreds = site ? await siteService.getWordPressCredentials(site.id) : null;
    if (!site || !wpCreds) {
      return reply.code(400).send({ error: "WordPress not connected for this site" });
    }

    const wp = new WordPressService(wpCreds);
    const [cats, tags] = await Promise.all([wp.listCategories(), wp.listTags()]);
    const wpCategoryMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
    const wpTagMap = Object.fromEntries(tags.map((t) => [t.id, t.name]));

    const jobIds: (string | null)[] = [];
    for (const wpPostId of body.wpPostIds) {
      const jobId = await app.boss.send("import-post", {
        tenantId,
        siteId: site.id,
        wpPostId,
        overwrite: body.overwrite,
        wpCategoryMap,
        wpTagMap,
      }, { singletonKey: `import:${site.id}:${wpPostId}` });
      jobIds.push(jobId);
    }

    return reply.code(202).send({
      data: { jobIds, count: body.wpPostIds.length, message: "Import jobs queued" },
    });
  });
}
