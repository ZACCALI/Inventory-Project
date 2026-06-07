import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['unified-scoreless-shrivel.ngrok-free.dev'],
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
