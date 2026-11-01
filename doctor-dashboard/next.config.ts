import type { NextConfig } from 'next';

// The dashboard is served at https://lilstepsclinics.com/doctor (Vercel
// rewrites /doctor/* to Cloud Run), so every route lives under this prefix.
// Build-time only: set BASE_PATH='' to serve from the root instead.
const basePath = process.env.BASE_PATH ?? '/doctor';

// Public hosts that proxy to this app. Server Actions compare the browser's
// Origin with the request host; list the proxy hosts so they are accepted
// even if the proxy does not forward x-forwarded-host.
const PROXY_HOSTS = ['lilstepsclinics.com', 'www.lilstepsclinics.com'];

const nextConfig: NextConfig = {
  // The parent app's package-lock.json sits one level up; pin the root so
  // Turbopack does not treat the whole repo as this app's workspace.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  // Self-contained server for the Cloud Run container (see Dockerfile).
  output: 'standalone',
  basePath,
  // Lets client and server code build raw URLs (window.location, <a href>)
  // with the same prefix that <Link>, router.push and redirect() add.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  experimental: {
    serverActions: { allowedOrigins: PROXY_HOSTS },
  },
};

export default nextConfig;
