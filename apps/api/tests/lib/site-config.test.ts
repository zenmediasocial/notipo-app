import { describe, expect, it } from "vitest";
import {
  CONFIG_ROW_TITLE,
  buildConfigurationProperties,
  buildLastSyncUpdate,
  extractPageRoutingContext,
  generateSiteKey,
  isConfigurationRow,
} from "../../src/lib/site-config.js";

describe("generateSiteKey", () => {
  it("generates prefixed keys that are unique and stable in length", () => {
    const a = generateSiteKey();
    const b = generateSiteKey();

    expect(a).toMatch(/^npk_[A-Za-z0-9_-]{24,}$/);
    expect(a).not.toBe(b);
    expect(a.length).toBe(b.length);
  });
});

describe("buildConfigurationProperties", () => {
  it("builds the Notion properties Notipo writes into the Configuration row", () => {
    const lastSync = new Date("2026-11-11T12:00:00.000Z");

    expect(buildConfigurationProperties({ key: "npk_abc", lastSync })).toEqual({
      "Is Config": { checkbox: true },
      "Notipo Key": { rich_text: [{ text: { content: "npk_abc" } }] },
      "Last Sync": { date: { start: "2026-11-11T12:00:00.000Z" } },
      "Config Locked": { checkbox: false },
    });
  });

  it("omits Last Sync when not provided", () => {
    expect(buildConfigurationProperties({ key: "npk_abc" })).toEqual({
      "Is Config": { checkbox: true },
      "Notipo Key": { rich_text: [{ text: { content: "npk_abc" } }] },
      "Last Sync": { date: null },
      "Config Locked": { checkbox: false },
    });
  });
});

describe("buildLastSyncUpdate", () => {
  it("builds a Last Sync property update", () => {
    const lastSync = new Date("2026-11-11T12:00:00.000Z");

    expect(buildLastSyncUpdate(lastSync)).toEqual({
      "Last Sync": { date: { start: "2026-11-11T12:00:00.000Z" } },
    });
  });
});

describe("extractPageRoutingContext", () => {
  it("reads the Status select and the parent database ID", () => {
    const page = {
      parent: { type: "database_id", database_id: "db-1" },
      properties: { Status: { select: { name: "Publish" } } },
    };

    expect(extractPageRoutingContext(page)).toEqual({
      status: "Publish",
      parentDatabaseId: "db-1",
    });
  });

  it("returns nulls for a page outside a database without a status", () => {
    const page = { parent: { type: "workspace" }, properties: {} };

    expect(extractPageRoutingContext(page)).toEqual({
      status: null,
      parentDatabaseId: null,
    });
  });
});

describe("isConfigurationRow", () => {
  const row = (title: string, props: Record<string, unknown> = {}) => ({
    properties: {
      Name: { title: [{ plain_text: title }] },
      ...props,
    },
  });

  it("treats the reserved Configuration row as configuration by title", () => {
    expect(isConfigurationRow(row(CONFIG_ROW_TITLE))).toBe(true);
    expect(isConfigurationRow(row("Regular post"))).toBe(false);
  });

  it("treats any row carrying a Notipo key as configuration regardless of title", () => {
    const renamed = row("Renamed", {
      "Notipo Key": { rich_text: [{ plain_text: "npk_abc" }] },
    });
    const keyless = row("Renamed", {
      "Notipo Key": { rich_text: [] },
    });

    expect(isConfigurationRow(renamed)).toBe(true);
    expect(isConfigurationRow(keyless)).toBe(false);
  });

  it("honors the Is Config flag on either side", () => {
    const flagged = row("Anything", { "Is Config": { checkbox: true } });
    const unflagged = row("Anything", { "Is Config": { checkbox: false } });

    expect(isConfigurationRow(flagged)).toBe(true);
    expect(isConfigurationRow(unflagged)).toBe(false);
  });

  it("does not confuse posts without a Notipo key", () => {
    expect(isConfigurationRow(row("Q4 HVAC checklist"))).toBe(false);
  });
});