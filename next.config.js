/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep native/Node-only deps out of the webpack bundle so they run in the
  // Node.js runtime as-is (also shared with the custom server + WS layer).
  experimental: {
    serverComponentsExternalPackages: ['pg', 'bcryptjs', 'jsonwebtoken', 'ws'],
  },
};

module.exports = nextConfig;
