import type { NextConfig } from "next";

// Where the Next.js server reaches FastAPI. Inside Docker that's the service name.
const API_URL_INTERNAL = process.env.API_URL_INTERNAL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Self-contained server bundle for a small production Docker image (see Dockerfile).
  output: "standalone",
  // The browser calls /api/... on this same origin; Next.js forwards it to FastAPI.
  // No CORS, and it works from a phone on your Wi-Fi where "localhost" means the phone.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL_INTERNAL}/:path*` }];
  },
  // Let phones on the local network load dev assets (hot reload) without warnings.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
