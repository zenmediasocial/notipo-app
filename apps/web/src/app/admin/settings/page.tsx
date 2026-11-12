"use client";

import { useState } from "react";
import { useApi, useApiCall } from "@/hooks/use-api";
import { capture } from "@/lib/posthog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LoadError } from "@/components/load-error";

interface SettingsData {
  data: {
    notion: {
      configured: boolean;
      authMode: string;
      oauthAvailable: boolean;
      workspaceId: string | null;
      databaseId: string | null;
      triggerStatus: string | null;
      publishTriggerStatus: string | null;
      updateTriggerStatus: string | null;
    };
    wordpress: {
      configured: boolean;
      siteUrl: string | null;
    };
    sites: Array<{
      id: string;
      key: string;
      name: string;
      notionRootPageId: string | null;
      notionDatabaseId: string | null;
      siteUrl: string | null;
      wpSeoPlugin: string | null;
      configured: boolean;
    }>;
    codeHighlighter: string;
    featuredImageMode: string;
    aiImageStyle: string | null;
    aiImageProvider: {
      provider: string;
      model: string;
      baseUrl: string | null;
      configured: boolean;
    } | null;
    aiImageAvailable: boolean;
    webhookUrl: string | null;
    effectivePlan: string;
  };
}

export default function SettingsPage() {
  const { data: settings, loading, error, refetch } = useApi<SettingsData>("/api/settings");
  const cfg = settings?.data;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>

      {/* Without this the page rendered its heading and nothing else on a failed
          request — no cards, no explanation, no way to tell it apart from a
          blog that simply has no settings yet. */}
      {error && !cfg && <LoadError message={error} onRetry={refetch} />}
      {loading && !cfg && !error && <p className="text-muted-foreground">Loading...</p>}

      {cfg && (
        <>
          <NotionCard cfg={cfg.notion} onUpdate={refetch} />
          <CodeHighlighterCard current={cfg.codeHighlighter} onUpdate={refetch} />
          <FeaturedImageCard
            mode={cfg.featuredImageMode}
            style={cfg.aiImageStyle}
            providerConfig={cfg.aiImageProvider}
            aiImageAvailable={cfg.aiImageAvailable}
            isPro={cfg.effectivePlan === "PRO"}
            onUpdate={refetch}
          />
          <WebhookCard current={cfg.webhookUrl} onUpdate={refetch} />
        </>
      )}
    </div>
  );
}

function NotionCard({
  cfg,
  onUpdate,
}: {
  cfg: SettingsData["data"]["notion"];
  onUpdate: () => void;
}) {
  const { call } = useApiCall();
  const [showManual, setShowManual] = useState(false);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connectOAuth() {
    const res = await call<{ data: { url: string } }>("/api/notion/oauth/authorize");
    window.location.href = res.data.url;
  }

  async function saveManual(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await call("/api/settings/notion", {
        method: "PUT",
        body: { accessToken: token },
      });
      capture("settings_notion_updated", { method: "manual" });
      setToken("");
      setShowManual(false);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function disconnect() {
    await call("/api/settings/notion", { method: "DELETE" });
    capture("notion_disconnected");
    setConfirmDisconnect(false);
    onUpdate();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Notion</CardTitle>
            <CardDescription>
              {cfg.configured
                ? `Connected via ${cfg.authMode}`
                : "Not connected"}
            </CardDescription>
          </div>
          <Badge variant={cfg.configured ? "default" : "secondary"}>
            {cfg.configured ? "Connected" : "Disconnected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {cfg.configured ? (
          <>
            {cfg.databaseId && (
              <div className="text-sm">
                <span className="text-muted-foreground">Database ID: </span>
                <code className="text-xs">{cfg.databaseId}</code>
              </div>
            )}
            {confirmDisconnect ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Disconnect Notion?</span>
                <Button variant="destructive" size="sm" onClick={disconnect}>Yes</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDisconnect(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="destructive" size="sm" onClick={() => setConfirmDisconnect(true)}>
                Disconnect
              </Button>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {cfg.oauthAvailable && (
              <Button onClick={connectOAuth}>Connect to Notion</Button>
            )}
            <Separator />
            {showManual ? (
              <form onSubmit={saveManual} className="space-y-3">
                <div className="space-y-2">
                  <Label>Integration Token</Label>
                  <Input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    One token connects every blog. Each blog&apos;s database is found
                    inside its template copy — no database ID needed here.
                  </p>
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowManual(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowManual(true)}>
                Use manual token
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CodeHighlighterCard({
  current,
  onUpdate,
}: {
  current: string;
  onUpdate: () => void;
}) {
  const { call } = useApiCall();
  const options = [
    { value: "WP_CODE", label: "WordPress Code Block" },
    { value: "HIGHLIGHT_JS", label: "Highlight.js" },
    { value: "PRISM_JS", label: "Prism.js" },
    { value: "PRISMATIC", label: "Prismatic" },
  ];

  async function change(value: string) {
    await call("/api/settings", {
      method: "PATCH",
      body: { codeHighlighter: value },
    });
    capture("settings_code_highlighter_changed", { value });
    onUpdate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Code Highlighter</CardTitle>
        <CardDescription>
          How code blocks are formatted in WordPress
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <Button
              key={opt.value}
              variant={current === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => change(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const AI_IMAGE_STYLES = [
  { value: "comic book", label: "Comic Book" },
  { value: "watercolor", label: "Watercolor" },
  { value: "3D render", label: "3D Render" },
  { value: "photorealistic", label: "Photorealistic" },
  { value: "cyberpunk", label: "Cyberpunk" },
  { value: "retro", label: "Retro" },
];

const AI_IMAGE_PROVIDERS = [
  {
    value: "GEMINI",
    label: "Gemini",
    defaultModel: "gemini-2.5-flash-image",
    placeholder: "AIza…",
    docsUrl: "https://aistudio.google.com/apikey",
    docsLabel: "aistudio.google.com/apikey",
  },
  {
    value: "OPENROUTER",
    label: "OpenRouter",
    defaultModel: "google/gemini-2.5-flash-image",
    placeholder: "sk-or-…",
    docsUrl: "https://openrouter.ai/keys",
    docsLabel: "openrouter.ai/keys",
  },
  {
    value: "FAL",
    label: "Fal.ai",
    defaultModel: "fal-ai/flux/schnell",
    placeholder: "Fal key",
    docsUrl: "https://fal.ai/dashboard/keys",
    docsLabel: "fal.ai/dashboard/keys",
  },
  {
    value: "MUAPI",
    label: "MUAPI",
    defaultModel: "flux-schnell",
    placeholder: "MUAPI key",
    docsUrl: "https://muapi.ai/docs/authentication",
    docsLabel: "muapi.ai/docs/authentication",
  },
] as const;

function FeaturedImageCard({
  mode,
  style,
  providerConfig,
  aiImageAvailable,
  isPro,
  onUpdate,
}: {
  mode: string;
  style: string | null;
  providerConfig: SettingsData["data"]["aiImageProvider"];
  aiImageAvailable: boolean;
  isPro: boolean;
  onUpdate: () => void;
}) {
  const { call } = useApiCall();
  const [selectedStyle, setSelectedStyle] = useState(style ?? "cyberpunk");
  const [provider, setProvider] = useState(providerConfig?.provider ?? "GEMINI");
  const [model, setModel] = useState(providerConfig?.model ?? "");
  const [baseUrl, setBaseUrl] = useState(providerConfig?.baseUrl ?? "");
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  const providerMeta =
    AI_IMAGE_PROVIDERS.find((option) => option.value === provider) ?? AI_IMAGE_PROVIDERS[0];
  const configuredProviderMeta = providerConfig
    ? AI_IMAGE_PROVIDERS.find((option) => option.value === providerConfig.provider)
    : undefined;

  async function saveKey() {
    setSavingKey(true);
    try {
      await call("/api/settings/ai-image", {
        method: "PUT",
        body: {
          provider,
          model: model.trim() || undefined,
          apiKey: keyInput,
          baseUrl: baseUrl.trim() || undefined,
        },
      });
      setKeyInput("");
      onUpdate();
    } finally {
      setSavingKey(false);
    }
  }

  async function removeKey() {
    setSavingKey(true);
    try {
      await call("/api/settings/ai-image", { method: "DELETE" });
      onUpdate();
    } finally {
      setSavingKey(false);
    }
  }

  async function setMode(value: string) {
    await call("/api/settings", {
      method: "PATCH",
      body: {
        featuredImageMode: value,
        ...(value === "AI_GENERATED" && { aiImageStyle: selectedStyle }),
      },
    });
    onUpdate();
  }

  async function changeStyle(value: string) {
    setSelectedStyle(value);
    if (mode === "AI_GENERATED") {
      await call("/api/settings", {
        method: "PATCH",
        body: { aiImageStyle: value },
      });
      onUpdate();
    }
  }

  const canUseAi = aiImageAvailable && isPro;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Featured Images</CardTitle>
        <CardDescription>
          How featured images are generated for new posts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={mode === "STANDARD" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("STANDARD")}
          >
            Standard
          </Button>
          <Button
            variant={mode === "AI_GENERATED" ? "default" : "outline"}
            size="sm"
            disabled={!canUseAi}
            onClick={() => setMode("AI_GENERATED")}
          >
            AI Generated
          </Button>
        </div>

        {/* Bring your own key: image generation is billed to whoever owns the key. */}
        <div className="space-y-3">
          <Label>AI image provider</Label>
          {providerConfig?.configured ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs text-muted-foreground">
                {(configuredProviderMeta?.label ?? providerConfig.provider)} is saved
                {providerConfig.model ? ` with model ${providerConfig.model}` : ""}.
                AI-generated images are billed to it.
              </p>
              <Button size="sm" variant="outline" onClick={removeKey} disabled={savingKey}>
                Remove
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {AI_IMAGE_PROVIDERS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={provider === option.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setProvider(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ai-image-model">Model (optional)</Label>
                  <Input
                    id="ai-image-model"
                    value={model}
                    placeholder={providerMeta.defaultModel}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-image-base-url">Base URL (optional)</Label>
                  <Input
                    id="ai-image-base-url"
                    type="url"
                    value={baseUrl}
                    placeholder="https://"
                    onChange={(e) => setBaseUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Input
                  id="ai-image-key"
                  type="password"
                  autoComplete="off"
                  placeholder={providerMeta.placeholder}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                />
                <Button size="sm" onClick={saveKey} disabled={savingKey || !keyInput.trim()}>
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Needed for AI-generated images, and billed to your own {providerMeta.label} account.
                Create one at{" "}
                <a
                  href={providerMeta.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {providerMeta.docsLabel}
                </a>
                .
              </p>
            </>
          )}

          {aiImageAvailable && !providerConfig?.configured && (
            <p className="text-xs text-muted-foreground">
              An instance-level AI image provider is available. Add a provider key here to bill this blog separately.
            </p>
          )}
        </div>

        {!aiImageAvailable && (
          <p className="text-xs text-muted-foreground">
            AI image generation needs an image provider API key.
          </p>
        )}
        {aiImageAvailable && !isPro && (
          <p className="text-xs text-muted-foreground">
            AI image generation is available on the Pro plan.
          </p>
        )}

        {canUseAi && (
          <div className="space-y-2">
            <Label>AI Image Style</Label>
            <div className="flex flex-wrap gap-2">
              {AI_IMAGE_STYLES.map((opt) => (
                <Button
                  key={opt.value}
                  variant={selectedStyle === opt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => changeStyle(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WebhookCard({
  current,
  onUpdate,
}: {
  current: string | null;
  onUpdate: () => void;
}) {
  const { call } = useApiCall();
  const [url, setUrl] = useState(current ?? "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await call("/api/settings", {
        method: "PATCH",
        body: { webhookUrl: url },
      });
      capture("settings_webhook_updated", { has_url: !!url });
      setSuccess("Saved");
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function testWebhook() {
    setTesting(true);
    setError(null);
    setSuccess(null);
    try {
      await call("/api/settings/test-webhook", { method: "POST" });
      setSuccess("Test message sent!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Webhook Notifications</CardTitle>
        <CardDescription>
          Get notified in Slack or Discord when a sync or publish fails.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={url}
              onChange={(e) => { setUrl(e.target.value); setSuccess(null); }}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-500">{success}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            {url && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={testing || !url}
                onClick={testWebhook}
              >
                {testing ? "Sending..." : "Test"}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
