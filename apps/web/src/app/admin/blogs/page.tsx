"use client";

import { useApi } from "@/hooks/use-api";
import { LoadError } from "@/components/load-error";
import { SitesCard, type SiteSummary } from "@/components/admin/sites-card";

interface SettingsSites {
  data: { sites: SiteSummary[] };
}

export default function BlogsPage() {
  const { data, loading, error, refetch } = useApi<SettingsSites>("/api/settings");

  return (
    <div className="space-y-6 max-w-2xl">
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
