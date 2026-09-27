/// <reference path="../.astro/types.d.ts" />
/// <reference path="../worker-configuration.d.ts" />
/// <reference types="@astrojs/cloudflare/types" />

type User = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
};

declare namespace App {
  interface Locals {
    user: User | null;
    session: { id: string; expiresAt: number; idToken: string | null } | null;
    /** Signed in and holding the fivebest-user role. */
    authorized: boolean;
  }
}
