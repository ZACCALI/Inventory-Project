import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import crypto from "crypto";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  register: false,
  additionalPrecacheEntries: [{ url: "/~offline", revision: crypto.randomUUID() }],
});

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

export default withSerwist(nextConfig);
