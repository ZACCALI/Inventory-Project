import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['unified-scoreless-shrivel.ngrok-free.dev'],
  outputFileTracingRoot: __dirname,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

export default nextConfig;
