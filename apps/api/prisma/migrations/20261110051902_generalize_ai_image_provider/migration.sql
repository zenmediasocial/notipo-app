-- Generalize the tenant's encrypted Gemini credential into an AI image
-- provider config. The payload is AES-256-GCM encrypted JSON, so the migration
-- renames the column without decrypting existing values. Application code
-- treats legacy decrypted {apiKey} payloads as Gemini configs.
ALTER TABLE "tenants" RENAME COLUMN "geminiCredentials" TO "aiImageProvider";
