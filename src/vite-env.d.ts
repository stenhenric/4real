/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TON_MANIFEST_URL?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
