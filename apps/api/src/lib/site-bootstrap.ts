/**
 * Notion-side bootstrap for a blog's template copy.
 *
 * One blog = one copy of the Notipo template: a top-level teamspace page
 * containing the posts database. The database's first row is the reserved
 * "Configuration" row (see lib/site-config.ts) where Notipo writes the site
 * key, last-sync stamp, and lock flag.
 */

import {
  CONFIG_IS_CONFIG_PROPERTY,
  CONFIG_KEY_PROPERTY,
  CONFIG_LAST_SYNC_PROPERTY,
  CONFIG_LOCKED_PROPERTY,
  buildConfigurationProperties,
  buildLastSyncUpdate,
} from "./site-config.js";

/** Structural subset of the Notion SDK client used here (stub-friendly). */
export interface NotionClientLike {
  blocks: {
    children: {
      list(args: Record<string, unknown>): Promise<{
        results: unknown[];
        has_more?: boolean;
        next_cursor?: string | null;
      }>;
    };
  };
  pages: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    update(args: Record<string, unknown>): Promise<unknown>;
  };
  databases: {
    update(args: Record<string, unknown>): Promise<unknown>;
    query(args: Record<string, unknown>): Promise<{ results: unknown[] }>;
  };
}

/** Find the posts database inside a template copy (its first child database). */
export async function findPostsDatabaseId(
  client: NotionClientLike,
  rootPageId: string,
): Promise<string | null> {
  const { results } = await client.blocks.children.list({
    block_id: rootPageId,
    page_size: 100,
  });
  for (const block of results) {
    const typed = block as { type?: string; id?: string };
    if (typed.type === "child_database" && typed.id) return typed.id;
  }
  return null;
}

/** Add the Notipo config properties to the posts database if missing. */
export async function ensureConfigurationProperties(
  client: NotionClientLike,
  databaseId: string,
): Promise<void> {
  await client.databases.update({
    database_id: databaseId,
    properties: {
      [CONFIG_IS_CONFIG_PROPERTY]: { checkbox: {} },
      [CONFIG_KEY_PROPERTY]: { rich_text: {} },
      [CONFIG_LAST_SYNC_PROPERTY]: { date: {} },
      [CONFIG_LOCKED_PROPERTY]: { checkbox: {} },
    },
  });
}

async function findConfigurationRow(
  client: NotionClientLike,
  databaseId: string,
): Promise<string | null> {
  const { results } = await client.databases.query({
    database_id: databaseId,
    filter: {
      property: CONFIG_IS_CONFIG_PROPERTY,
      checkbox: { equals: true },
    },
    page_size: 1,
  });
  const row = results[0] as { id?: string } | undefined;
  return row?.id ?? null;
}

/**
 * Create or update the reserved Configuration row carrying the site key.
 * Returns the row's page ID.
 */
export async function writeConfigurationRow(
  client: NotionClientLike,
  input: { databaseId: string; key: string; lastSync?: Date; locked?: boolean },
): Promise<string> {
  const properties = buildConfigurationProperties(input);
  const existingId = await findConfigurationRow(client, input.databaseId);

  if (existingId) {
    await client.pages.update({ page_id: existingId, properties });
    return existingId;
  }

  const created = await client.pages.create({
    parent: { database_id: input.databaseId },
    properties,
  });
  return created.id;
}

/**
 * Wire a fresh template copy: find its posts database, add the Notipo config
 * properties, and write the reserved Configuration row carrying the site key.
 */
export async function bootstrapTemplateCopy(
  client: NotionClientLike,
  input: { rootPageId: string; key: string },
): Promise<{ databaseId: string; configurationRowId: string }> {
  const databaseId = await findPostsDatabaseId(client, input.rootPageId);
  if (!databaseId) {
    throw new Error("No posts database found inside the template copy");
  }
  await ensureConfigurationProperties(client, databaseId);
  const configurationRowId = await writeConfigurationRow(client, {
    databaseId,
    key: input.key,
  });
  return { databaseId, configurationRowId };
}

/** Lock the Configuration row after setup. Throws when it does not exist. */
export async function lockConfigurationRow(
  client: NotionClientLike,
  databaseId: string,
): Promise<void> {
  const rowId = await findConfigurationRow(client, databaseId);
  if (!rowId) throw new Error("Configuration row not found");
  await client.pages.update({
    page_id: rowId,
    properties: { [CONFIG_LOCKED_PROPERTY]: { checkbox: true } },
  });
}

/** Stamp Last Sync on the Configuration row (no-op before configuration). */
export async function updateLastSync(
  client: NotionClientLike,
  databaseId: string,
  lastSync: Date,
): Promise<void> {
  const rowId = await findConfigurationRow(client, databaseId);
  if (!rowId) return;
  await client.pages.update({
    page_id: rowId,
    properties: buildLastSyncUpdate(lastSync),
  });
}