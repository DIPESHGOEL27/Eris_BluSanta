import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // Use environment variable for backend URL, fallback to localhost for local development
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`, // Your backend server URL
      },
    ];
  },
};

export default nextConfig;
