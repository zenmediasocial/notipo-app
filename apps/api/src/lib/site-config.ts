/**
 * Contract for the reserved "Configuration" row.
 *
 * Each blog is one copy of the Notipo template: a top-level page containing a
 * posts database. The database's first row is reserved and named
 * "Configuration"; it carries the Notipo site key and sync metadata as Notion
 * properties. The sync pipeline must never treat that row as a post.
 */

export const CONFIG_ROW_TITLE = "Configuration";
export const CONFIG_IS_CONFIG_PROPERTY = "Is Config";
export const CONFIG_KEY_PROPERTY = "Notipo Key";
export const CONFIG_LAST_SYNC_PROPERTY = "Last Sync";
export const CONFIG_LOCKED_PROPERTY = "Config Locked";

/** Generate the site key Notipo writes into the Configuration row. */
export function generateSiteKey(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `npk_${Buffer.from(bytes).toString("base64url")}`;
}

export interface ConfigurationPropertyInput {
  key: string;
  lastSync?: Date;
  locked?: boolean;
}

/** Notion properties payload for creating/updating the Configuration row. */
export function buildConfigurationProperties(
  input: ConfigurationPropertyInput,
): Record<string, unknown> {
  return {
    [CONFIG_IS_CONFIG_PROPERTY]: { checkbox: true },
    [CONFIG_KEY_PROPERTY]: { rich_text: [{ text: { content: input.key } }] },
    [CONFIG_LAST_SYNC_PROPERTY]: input.lastSync
      ? { date: { start: input.lastSync.toISOString() } }
      : { date: null },
    [CONFIG_LOCKED_PROPERTY]: { checkbox: input.locked ?? false },
  };
}

/** Notion properties payload for a last-sync heartbeat. */
export function buildLastSyncUpdate(lastSync: Date): Record<string, unknown> {
  return {
    [CONFIG_LAST_SYNC_PROPERTY]: { date: { start: lastSync.toISOString() } },
  };
}

export interface PageRoutingContext {
  status: string | null;
  parentDatabaseId: string | null;
}

/**
 * Extract the routing context from a Notion page: its Status select and the
 * parent database ID — which template copy's posts database it lives in.
 */
export function extractPageRoutingContext(page: unknown): PageRoutingContext {
  const raw = page as {
    parent?: { type?: string; database_id?: string };
    properties?: Record<string, NotionPropertyLike>;
  };
  const status = raw?.properties?.["Status"] as
    | { select?: { name?: string } }
    | undefined;
  const parent = raw?.parent;
  return {
    status: status?.select?.name ?? null,
    parentDatabaseId:
      parent?.type === "database_id" && parent.database_id
        ? parent.database_id
        : null,
  };
}

interface NotionPropertyLike {
  checkbox?: boolean;
  rich_text?: Array<{ plain_text?: string }>;
  title?: Array<{ plain_text?: string }>;
}

/**
 * True when a Notion database row is the reserved Configuration row.
 * Detection order: explicit Is Config flag, then the Notipo key, then the
 * reserved title — so a renamed row is still recognized once configured.
 */
export function isConfigurationRow(page: unknown): boolean {
  const properties = (page as { properties?: Record<string, NotionPropertyLike> })
    ?.properties;
  if (!properties) return false;

  if (properties[CONFIG_IS_CONFIG_PROPERTY]?.checkbox === true) return true;

  const key = properties[CONFIG_KEY_PROPERTY];
  if (key?.rich_text?.some((part) => (part.plain_text ?? "").length > 0)) {
    return true;
  }

  for (const prop of Object.values(properties)) {
    if (Array.isArray(prop?.title)) {
      const title = prop.title.map((part) => part.plain_text ?? "").join("");
      if (title === CONFIG_ROW_TITLE) return true;
    }
  }

  return false;
}