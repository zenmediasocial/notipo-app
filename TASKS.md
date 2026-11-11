# Tasks

## Open

### Discover Notion template copies by polling instead of requiring the share URL

- **Problem:** Connecting a blog requires pasting the Notion template copy's page URL/ID. High burden, error-prone — and unnecessary, since the copy is already shared with the Notipo integration.
- **Proposed:** Poll the pages/databases the integration can access, detect template copies (top-level page containing a posts database, confirmed via its `Configuration` row), and present them as a pickable list in the Connect blog flow. Keep paste-a-URL as an optional fallback only.
- **Acceptance criteria:**
  - Connect blog works end-to-end without pasting any Notion ID/URL.
  - Already-connected copies are marked and cannot be double-connected.
  - URL/ID input remains as fallback.
- **Origin:** owner decision 2026-11-11 (replaces the share-URL requirement added in `b0c02fb`).

## Done

### Multiple WordPress sites per tenant
- Shipped in `b0c02fb` + `e04647a` (Site model, /api/sites, Blogs admin page).
