/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REPO_OWNER?: string;
  readonly VITE_REPO_NAME?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_BUILD_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
