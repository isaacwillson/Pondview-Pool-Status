"use client";

import { LogOut } from "lucide-react";
import posthog from "posthog-js";

/** Clears the admin session, then returns to the login screen. */
export function SignOutButton() {
  async function handleLogout() {
    posthog.capture("admin_logged_out");
    posthog.reset();
    await fetch("/api/admin-auth", { method: "DELETE" });
    window.location.href = "/admin/login";
  }

  return (
    <button
      onClick={handleLogout}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <LogOut className="h-3.5 w-3.5" />
      Sign out
    </button>
  );
}
