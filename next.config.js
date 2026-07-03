/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep native/Node-only deps out of the webpack bundle so they run in the
  // Node.js runtime as-is (also shared with the custom server + WS layer).
  experimental: {
    serverComponentsExternalPackages: [
      'pg',
      'bcryptjs',
      'jsonwebtoken',
      'ws',
      'googleapis',
      '@aws-sdk/client-s3',
      '@aws-sdk/s3-request-presigner',
      'playwright',
    ],
  },
};

module.exports = nextConfig;
