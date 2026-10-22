import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const emulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
const supabase = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : "";
// reCAPTCHA v3 for App Check loads Google scripts and a hidden frame (only when a key is set).
const recaptcha = !!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && !emulators;

// Static CSP (plan.md Phase 7). ponytail: 'unsafe-inline' scripts because Next's bootstrap is
// inline and nonces would force every page to render per request. User content is always
// rendered as text. Upgrade path: nonces via proxy.ts (Next docs, content-security-policy.md).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${recaptcha ? " https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/" : ""}`,
  recaptcha
    ? "frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/"
    : "",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data:${supabase ? ` ${supabase}` : ""}`,
  "font-src 'self'",
  [
    "connect-src 'self'",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://firestore.googleapis.com",
    recaptcha
      ? "https://content-firebaseappcheck.googleapis.com https://www.google.com/recaptcha/"
      : "",
    emulators ? "http://127.0.0.1:9099 http://127.0.0.1:8080 ws://127.0.0.1:8080" : "",
    isDev ? "ws:" : "",
  ]
    .filter(Boolean)
    .join(" "),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  isDev || emulators ? "" : "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Complaint ids are in URLs; don't hand them to other sites.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // The session lives in the Firebase client SDK (plan.md D5), so signed-in screens render in
    // the browser and can never be in the static shell. Validate only segments that opt in.
    instantInsights: { validationLevel: "manual-warning" },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
