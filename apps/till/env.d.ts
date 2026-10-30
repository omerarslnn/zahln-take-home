/// <reference types="expo/types" />

// Public build-time settings that Expo inlines into the bundle (see .env.example).
declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_API_BASE_URL?: string;
    readonly EXPO_PUBLIC_CANDIDATE_ID?: string;
  }
}
