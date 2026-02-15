// Centralized CORS origin builder with wildcard pattern support

/**
 * Build a CORS origin list that includes:
 * - Localhost dev origins (always allowed)
 * - CORS_ORIGIN env var entries (comma-separated, supports wildcards like *.vercel.app)
 */
export function buildCorsOrigin(): (string | RegExp)[] {
  const origins: (string | RegExp)[] = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
  ];

  const envOrigins = process.env.CORS_ORIGIN?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (envOrigins) {
    for (const origin of envOrigins) {
      if (origin.includes("*")) {
        // Convert wildcard pattern to regex: https://*.vercel.app → /^https:\/\/.*\.vercel\.app$/
        const escaped = origin
          .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, ".*");
        origins.push(new RegExp(`^${escaped}$`));
      } else {
        origins.push(origin);
      }
    }
  }

  return origins;
}
