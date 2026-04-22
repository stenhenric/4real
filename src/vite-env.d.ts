/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TON_MANIFEST_URL?: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
