-- One Site row per Notion template copy = one WordPress site.
-- Backfill: each existing tenant becomes one legacy Site carrying the
-- tenant's existing WordPress connection, so every row can be scoped.

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notionRootPageId" TEXT,
    "notionDatabaseId" TEXT,
    "wordpressCredentials" TEXT,
    "wpSiteUrl" TEXT,
    "wpSeoPlugin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- Backfill: one legacy site per tenant (existing WP connection moves here)
INSERT INTO "sites" ("id", "tenantId", "key", "name", "notionRootPageId", "notionDatabaseId", "wordpressCredentials", "wpSiteUrl", "wpSeoPlugin", "createdAt", "updatedAt")
SELECT
    lower(replace(gen_random_uuid()::text, '-', '')),
    t."id",
    'npk_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24),
    t."name",
    NULL,
    t."notionDatabaseId",
    t."wordpressCredentials",
    t."wpSiteUrl",
    t."wpSeoPlugin",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "tenants" t;

-- Add siteId columns
ALTER TABLE "posts" ADD COLUMN "siteId" TEXT;
ALTER TABLE "categories" ADD COLUMN "siteId" TEXT;
ALTER TABLE "tags" ADD COLUMN "siteId" TEXT;
ALTER TABLE "image_mappings" ADD COLUMN "siteId" TEXT;

-- Backfill content rows to their tenant's legacy site
UPDATE "posts" p SET "siteId" = s."id" FROM "sites" s WHERE s."tenantId" = p."tenantId";
UPDATE "categories" c SET "siteId" = s."id" FROM "sites" s WHERE s."tenantId" = c."tenantId";
UPDATE "tags" t SET "siteId" = s."id" FROM "sites" s WHERE s."tenantId" = t."tenantId";
UPDATE "image_mappings" m SET "siteId" = s."id" FROM "sites" s WHERE s."tenantId" = m."tenantId";

-- Every content row belongs to a site
ALTER TABLE "posts" ALTER COLUMN "siteId" SET NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "siteId" SET NOT NULL;
ALTER TABLE "tags" ALTER COLUMN "siteId" SET NOT NULL;
ALTER TABLE "image_mappings" ALTER COLUMN "siteId" SET NOT NULL;

-- Site constraints
CREATE UNIQUE INDEX "sites_key_key" ON "sites"("key");
CREATE UNIQUE INDEX "sites_tenantId_notionDatabaseId_key" ON "sites"("tenantId", "notionDatabaseId");
CREATE INDEX "sites_tenantId_idx" ON "sites"("tenantId");

-- Site-scoped uniqueness replaces tenant-scoped uniqueness
DROP INDEX "posts_tenantId_notionPageId_key";
DROP INDEX "categories_tenantId_name_key";
DROP INDEX "tags_tenantId_name_key";
DROP INDEX "image_mappings_tenantId_notionImageUrl_key";

CREATE UNIQUE INDEX "posts_siteId_notionPageId_key" ON "posts"("siteId", "notionPageId");
CREATE INDEX "posts_siteId_status_idx" ON "posts"("siteId", "status");
CREATE UNIQUE INDEX "categories_siteId_name_key" ON "categories"("siteId", "name");
CREATE UNIQUE INDEX "tags_siteId_name_key" ON "tags"("siteId", "name");
CREATE UNIQUE INDEX "image_mappings_siteId_notionImageUrl_key" ON "image_mappings"("siteId", "notionImageUrl");
CREATE INDEX "image_mappings_siteId_postId_idx" ON "image_mappings"("siteId", "postId");

-- Foreign keys
ALTER TABLE "sites" ADD CONSTRAINT "sites_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "posts" ADD CONSTRAINT "posts_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tags" ADD CONSTRAINT "tags_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "image_mappings" ADD CONSTRAINT "image_mappings_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;