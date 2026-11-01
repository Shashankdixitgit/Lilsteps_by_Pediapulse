import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The parent app's package-lock.json sits one level up; pin the root so
  // Turbopack does not treat the whole repo as this app's workspace.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  // Self-contained server for the Cloud Run container (see Dockerfile).
  output: 'standalone',
};

export default nextConfig;
