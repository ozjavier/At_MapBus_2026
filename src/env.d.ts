/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DB_HOST: string;
  readonly DB_PORT: string;
  readonly DB_USER: string;
  readonly DB_PASSWORD: string;
  readonly DB_NAME: string;
  readonly SESSION_COOKIE_NAME: string;
  readonly SESSION_DURATION_DAYS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'USER' | string;
};

declare namespace App {
  interface Locals {
    user: SessionUser | null;
  }
}
