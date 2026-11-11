"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useApi, useApiCall } from "@/hooks/use-api";
import { capture } from "@/lib/posthog";
import { LoadError } from "@/components/load-error";
import { SitesCard, type SiteSummary } from "@/components/admin/sites-card";

interface SettingsSites {
  data: { sites: SiteSummary[] };
}

/**
 * Capture the one-click WordPress approval round-trip: WordPress redirects
 * back to /admin/blogs with site_url/user_login/password in the query, so the
 * user never types credentials into Notipo. The query is cleaned immediately.
 */
function WPAuthHandler({ onUpdate }: { onUpdate: () => void }) {
  const { call } = useApiCall();
  const searchParams = useSearchParams();
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    if (handled) return;
    const userLogin = searchParams.get("user_login");
    const password = searchParams.get("password");
    const querySiteUrl = searchParams.get("site_url");
    if (!userLogin || !password) return;
    setHandled(true);

    let pending: { name?: string; notionRootPageId?: string; siteUrl?: string } = {};
    try {
      pending = JSON.parse(sessionStorage.getItem("pendingSiteConnect") ?? "{}");
    } catch { /* fall back to query params */ }
    sessionStorage.removeItem("pendingSiteConnect");

    const url = new URL(window.location.href);
    url.searchParams.delete("user_login");
    url.searchParams.delete("password");
    url.searchParams.delete("site_url");
    window.history.replaceState({}, "", url.toString());

    const wpSiteUrl = (pending.siteUrl ?? querySiteUrl ?? "").replace(/\/+$/, "");
    const notionRootPageId = pending.notionRootPageId ?? "";
    if (!wpSiteUrl || !notionRootPageId) {
      toast.error("Start the connection from the Connect blog form so Notipo knows which template copy to wire.");
      return;
    }

    void (async () => {
      try {
        await call("/api/sites", {
          method: "POST",
          body: {
            name: pending.name || new URL(wpSiteUrl).hostname,
            notionRootPageId,
            wpSiteUrl,
            username: userLogin,
            appPassword: password,
          },
        });
        capture("settings_site_connected", { method: "wp_approval" });
        toast.success("Blog connected");
        onUpdate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to connect site");
      }
    })();
  }, [handled, searchParams, call, onUpdate]);

  return null;
}

export default function BlogsPage() {
  const { data, loading, error, refetch } = useApi<SettingsSites>("/api/settings");

  return (
    <div className="space-y-6 max-w-2xl">
      <WPAuthHandler onUpdate={refetch} />
      <h1 className="text-3xl font-semibold tracking-tight">Blogs</h1>
      <p className="text-muted-foreground">
        One blog = one Notion template copy = one WordPress site.
      </p>
      {error && !data && <LoadError message={error} onRetry={refetch} />}
      {loading && !data && !error && <p className="text-muted-foreground">Loading...</p>}
      {data && <SitesCard sites={data.data.sites} onUpdate={refetch} />}
    </div>
  );
}
