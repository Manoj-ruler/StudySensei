import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// The code editor (Monaco) is loaded from this CDN at runtime.
const MONACO_CDN = "https://cdn.jsdelivr.net";

function supabaseOrigins(): string[] {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];
  try {
    const { host } = new URL(url);
    return [`https://${host}`, `wss://${host}`];
  } catch {
    return [];
  }
}

/**
 * Content Security Policy. It limits where scripts, styles and images may
 * load from and where the page may send data, which contains the damage if
 * untrusted content (an uploaded document, a model answer) ever reaches the page.
 *
 * 'unsafe-inline' is still needed for scripts: Next.js injects inline bootstrap
 * scripts, and removing it requires per-request nonces. External script sources
 * are restricted to this site and the editor CDN.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${MONACO_CDN}`,
  `style-src 'self' 'unsafe-inline' ${MONACO_CDN}`,
  // No remote images: a model answer or document cannot make the page fetch a tracking URL.
  "img-src 'self' data: blob:",
  `font-src 'self' data: ${MONACO_CDN}`,
  `connect-src 'self' ${[...supabaseOrigins(), MONACO_CDN].join(" ")}${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Browsers ignore this over plain HTTP, so it is harmless in local development.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
