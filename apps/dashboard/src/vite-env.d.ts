interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CANDIDATE_ID?: string;
  readonly VITE_SEEDED_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
