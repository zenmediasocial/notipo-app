"use client";

import { useState } from "react";
import { useApiCall } from "@/hooks/use-api";
import { capture } from "@/lib/posthog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface SiteSummary {
  id: string;
  key: string;
  name: string;
  notionRootPageId: string | null;
  notionDatabaseId: string | null;
  siteUrl: string | null;
  wpSeoPlugin: string | null;
  configured: boolean;
}

export function SitesCard({
  sites,
  onUpdate,
}: {
  sites: SiteSummary[];
  onUpdate: () => void;
}) {
  const { call } = useApiCall();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [rootPage, setRootPage] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [notionToken, setNotionToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [healthNote, setHealthNote] = useState<string | null>(null);

  // Accepts a pasted Notion page URL or a raw page ID
  function parseNotionPageId(input: string): string {
    const trimmed = input.trim();
    const dashed = trimmed.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const plain = trimmed.match(/([0-9a-f]{32})/i);
    const found = dashed?.[1] ?? plain?.[1] ?? trimmed;
    return found.replace(/-/g, "");
  }

  // One-click: WordPress itself issues the application password on its own
  // approve screen, then redirects back with user_login/password in the query
  // (captured by WPAuthHandler on this page). No credential typing in Notipo.
  function startOneClick(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let parsed: URL;
    try { parsed = new URL(siteUrl.replace(/\/+$/, "")); } catch { return; }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
    sessionStorage.setItem(
      "pendingSiteConnect",
      JSON.stringify({
        name,
        notionRootPageId: parseNotionPageId(rootPage),
        siteUrl: parsed.origin,
        notionAccessToken: notionToken || undefined,
      }),
    );
    const callbackUrl = `${window.location.origin}/admin/blogs`;
    window.location.href = `${parsed.origin}/wp-admin/authorize-application.php?app_name=Notipo&success_url=${encodeURIComponent(callbackUrl)}`;
  }

  function submit(e: React.FormEvent) {
    if (!showManual) {
      startOneClick(e);
      return;
    }
    void connect(e);
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await call("/api/sites", {
        method: "POST",
        body: {
          name,
          notionRootPageId: parseNotionPageId(rootPage),
          wpSiteUrl: siteUrl.replace(/\/+$/, ""),
          username,
          appPassword,
          notionAccessToken: notionToken || undefined,
        },
      });
      capture("settings_site_connected");
      setName("");
      setRootPage("");
      setSiteUrl("");
      setUsername("");
      setAppPassword("");
      setAdding(false);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect site");
    } finally {
      setSaving(false);
    }
  }

  async function testHealth(id: string) {
    setHealthNote(null);
    try {
      const res = await call<{ data: { connected: boolean; user: string | null } }>(
        `/api/sites/${id}/health`,
        { method: "POST" },
      );
      setHealthNote(
        res.data.connected
          ? `Connected as ${res.data.user ?? "unknown user"}`
          : "Could not connect to WordPress",
      );
    } catch {
      setHealthNote("Could not connect to WordPress");
    }
  }

  async function lockConfig(id: string) {
    try {
      await call(`/api/sites/${id}/lock`, { method: "POST" });
      capture("settings_site_config_locked");
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to lock configuration");
    }
  }

  async function disconnect(id: string) {
    await call(`/api/sites/${id}`, { method: "DELETE" });
    capture("settings_site_disconnected");
    setConfirmDelete(null);
    onUpdate();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Blogs</CardTitle>
            <CardDescription>
              One blog = one Notion template copy = one WordPress site
            </CardDescription>
          </div>
          {!adding && (
            <Button size="sm" onClick={() => setAdding(true)}>Connect blog</Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {healthNote && <p className="text-sm text-muted-foreground">{healthNote}</p>}
        {sites.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No blogs connected yet.</p>
        )}
        {sites.map((site) => (
          <div key={site.id} className="flex items-center justify-between gap-2 border rounded-md p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{site.name}</span>
                {site.configured ? (
                  <Badge variant="default">WordPress</Badge>
                ) : (
                  <Badge variant="secondary">No WP credentials</Badge>
                )}
                {site.notionDatabaseId && <Badge variant="outline">Template copy</Badge>}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {site.siteUrl ?? "No site URL"} · key {site.key}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => testHealth(site.id)}>Test</Button>
              {site.notionDatabaseId && (
                <Button variant="ghost" size="sm" onClick={() => lockConfig(site.id)}>Lock config</Button>
              )}
              {confirmDelete === site.id ? (
                <>
                  <Button variant="destructive" size="sm" onClick={() => disconnect(site.id)}>Yes</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(site.id)}>Disconnect</Button>
              )}
            </div>
          </div>
        ))}

        {adding && (
          <form onSubmit={submit} className="space-y-3 border rounded-md p-3">
            <div className="space-y-1">
              <Label htmlFor="site-name">Blog name</Label>
              <Input id="site-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Crown Trophy" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="site-root">Notion template copy (page URL or ID)</Label>
              <Input id="site-root" value={rootPage} onChange={(e) => setRootPage(e.target.value)} required placeholder="https://notion.so/teamspace/Page-30d842af..." />
              <p className="text-xs text-muted-foreground">
                Duplicate the Notipo template as a top-level teamspace page, share it with the Notipo integration, then paste it here.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="site-notion">Notion integration token (only needed once, if Notion isn&apos;t connected yet)</Label>
              <Input id="site-notion" type="password" value={notionToken} onChange={(e) => setNotionToken(e.target.value)} placeholder="ntn_..." />
            </div>
            <div className="space-y-1">
              <Label htmlFor="site-url">WordPress site URL</Label>
              <Input id="site-url" type="url" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} required placeholder="https://yourblog.com" />
            </div>
            {showManual && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="site-user">WordPress username</Label>
                  <Input id="site-user" value={username} onChange={(e) => setUsername(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="site-pass">WordPress application password</Label>
                  <Input id="site-pass" type="password" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} required />
                </div>
              </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {showManual ? (saving ? "Connecting..." : "Connect blog") : "Approve in WordPress"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowManual(!showManual)}>
                {showManual ? "Use WordPress approval instead" : "Use application password instead"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(false); setError(null); }}>Cancel</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
