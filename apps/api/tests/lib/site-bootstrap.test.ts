import { describe, expect, it, vi } from "vitest";
import {
  bootstrapTemplateCopy,
  ensureConfigurationProperties,
  findPostsDatabaseId,
  lockConfigurationRow,
  updateLastSync,
  writeConfigurationRow,
} from "../../src/lib/site-bootstrap.js";

function stubClient() {
  return {
    blocks: { children: { list: vi.fn() } },
    pages: { create: vi.fn(), update: vi.fn() },
    databases: { update: vi.fn(), query: vi.fn() },
  };
}

describe("findPostsDatabaseId", () => {
  it("returns the first child database inside the template copy", async () => {
    const client = stubClient();
    client.blocks.children.list.mockResolvedValue({
      results: [
        { type: "paragraph", paragraph: {} },
        { type: "child_database", id: "db-1", child_database: { title: "Posts" } },
      ],
    });

    const dbId = await findPostsDatabaseId(client as never, "root-page-1");

    expect(dbId).toBe("db-1");
    expect(client.blocks.children.list).toHaveBeenCalledWith({
      block_id: "root-page-1",
      page_size: 100,
    });
  });

  it("returns null when the copy contains no database", async () => {
    const client = stubClient();
    client.blocks.children.list.mockResolvedValue({
      results: [{ type: "paragraph", id: "p1", paragraph: {} }],
    });

    await expect(findPostsDatabaseId(client as never, "root-page-1")).resolves.toBeNull();
  });
});

describe("ensureConfigurationProperties", () => {
  it("adds the Notipo config properties to the posts database", async () => {
    const client = stubClient();
    client.databases.update.mockResolvedValue({});

    await ensureConfigurationProperties(client as never, "db-1");

    expect(client.databases.update).toHaveBeenCalledWith({
      database_id: "db-1",
      properties: {
        "Is Config": { checkbox: {} },
        "Notipo Key": { rich_text: {} },
        "Last Sync": { date: {} },
        "Config Locked": { checkbox: {} },
      },
    });
  });
});

describe("writeConfigurationRow", () => {
  it("creates the reserved Configuration row with the site key", async () => {
    const client = stubClient();
    client.databases.query.mockResolvedValue({ results: [] });
    client.pages.create.mockResolvedValue({ id: "config-row-1" });

    const rowId = await writeConfigurationRow(client as never, {
      databaseId: "db-1",
      key: "npk_abc",
    });

    expect(rowId).toBe("config-row-1");
    expect(client.pages.create).toHaveBeenCalledWith({
      parent: { database_id: "db-1" },
      properties: expect.objectContaining({
        "Is Config": { checkbox: true },
        "Notipo Key": { rich_text: [{ text: { content: "npk_abc" } }] },
      }),
    });
  });

  it("updates the existing Configuration row instead of creating a second one", async () => {
    const client = stubClient();
    client.databases.query.mockResolvedValue({
      results: [{ id: "config-row-1", properties: {} }],
    });
    client.pages.update.mockResolvedValue({});

    const rowId = await writeConfigurationRow(client as never, {
      databaseId: "db-1",
      key: "npk_abc",
    });

    expect(rowId).toBe("config-row-1");
    expect(client.pages.create).not.toHaveBeenCalled();
    expect(client.pages.update).toHaveBeenCalledWith(
      expect.objectContaining({ page_id: "config-row-1" }),
    );
  });
});

describe("bootstrapTemplateCopy", () => {
  it("wires a template copy: finds the posts database and writes the Configuration row", async () => {
    const client = stubClient();
    client.blocks.children.list.mockResolvedValue({
      results: [{ type: "child_database", id: "db-1", child_database: { title: "Posts" } }],
    });
    client.databases.update.mockResolvedValue({});
    client.databases.query.mockResolvedValue({ results: [] });
    client.pages.create.mockResolvedValue({ id: "config-row-1" });

    const result = await bootstrapTemplateCopy(client as never, {
      rootPageId: "root-page-1",
      key: "npk_abc",
    });

    expect(result).toEqual({
      databaseId: "db-1",
      configurationRowId: "config-row-1",
    });
    expect(client.databases.update).toHaveBeenCalled();
    expect(client.pages.create).toHaveBeenCalled();
  });

  it("throws when the copy contains no posts database", async () => {
    const client = stubClient();
    client.blocks.children.list.mockResolvedValue({ results: [] });

    await expect(
      bootstrapTemplateCopy(client as never, { rootPageId: "root-page-1", key: "npk_abc" }),
    ).rejects.toThrow(/No posts database found/i);
    expect(client.pages.create).not.toHaveBeenCalled();
  });
});

describe("lockConfigurationRow", () => {
  it("sets Config Locked on the existing Configuration row", async () => {
    const client = stubClient();
    client.databases.query.mockResolvedValue({
      results: [{ id: "config-row-1", properties: {} }],
    });
    client.pages.update.mockResolvedValue({});

    await lockConfigurationRow(client as never, "db-1");

    expect(client.pages.update).toHaveBeenCalledWith({
      page_id: "config-row-1",
      properties: { "Config Locked": { checkbox: true } },
    });
  });

  it("throws when the Configuration row does not exist yet", async () => {
    const client = stubClient();
    client.databases.query.mockResolvedValue({ results: [] });

    await expect(lockConfigurationRow(client as never, "db-1")).rejects.toThrow(
      /Configuration row not found/i,
    );
    expect(client.pages.update).not.toHaveBeenCalled();
  });
});

describe("updateLastSync", () => {
  it("stamps Last Sync on the Configuration row", async () => {
    const client = stubClient();
    client.databases.query.mockResolvedValue({
      results: [{ id: "config-row-1", properties: {} }],
    });
    client.pages.update.mockResolvedValue({});
    const lastSync = new Date("2026-11-11T12:00:00.000Z");

    await updateLastSync(client as never, "db-1", lastSync);

    expect(client.pages.update).toHaveBeenCalledWith({
      page_id: "config-row-1",
      properties: { "Last Sync": { date: { start: "2026-11-11T12:00:00.000Z" } } },
    });
  });

  it("is a no-op when the Configuration row does not exist", async () => {
    const client = stubClient();
    client.databases.query.mockResolvedValue({ results: [] });

    await updateLastSync(client as never, "db-1", new Date());

    expect(client.pages.update).not.toHaveBeenCalled();
  });
});