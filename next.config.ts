import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import crypto from "crypto";

const revision = crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  register: false,
  additionalPrecacheEntries: [
    { url: "/~offline", revision },
    { url: "/dashboard", revision },
    { url: "/inventory", revision },
    { url: "/customers", revision },
    { url: "/drivers", revision },
    { url: "/orders", revision },
    { url: "/orders/create", revision },
    { url: "/expenses", revision },
    { url: "/delivery", revision },
    { url: "/history", revision },
    { url: "/reports", revision },
    { url: "/users", revision },
    { url: "/settings", revision },
  ],
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
