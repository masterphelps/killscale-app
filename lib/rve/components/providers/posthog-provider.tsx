"use client";

// PostHog is not used in KillScale — no-op provider
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
