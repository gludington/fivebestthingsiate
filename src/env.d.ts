/// <reference path="../.astro/types.d.ts" />
type D1Database = import('@cloudflare/workers-types').D1Database;
type R2Bucket = import('@cloudflare/workers-types').R2Bucket;

type ENV = {
  DB: D1Database;
  IMAGES: R2Bucket;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  SESSION_SECRET: string;
};

type User = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
};

declare namespace App {
  interface Locals {
    runtime: {
      env: ENV;
    };
    user: User | null;
    session: { id: string } | null;
  }
}
