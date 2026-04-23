/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TON_MANIFEST_URL?: string
  readonly VITE_MERCHANT_MPESA_NUMBER?: string
  readonly VITE_MERCHANT_WALLET_ADDRESS?: string
  readonly VITE_MERCHANT_INSTRUCTIONS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
