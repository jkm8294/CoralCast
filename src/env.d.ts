/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROXY_PMEL?: string;
  readonly VITE_PROXY_COASTWATCH?: string;
  readonly VITE_PROXY_USF?: string;
  readonly VITE_PROXY_PFEG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
