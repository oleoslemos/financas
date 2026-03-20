/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_CLERK_PUBLISHABLE_KEY: string
  /** E-mails permitidos, separados por vírgula. Se vazio, não restringe no front. */
  readonly VITE_ALLOWED_EMAILS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
