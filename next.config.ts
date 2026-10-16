import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Profile files (CV PDFs etc.) are uploaded one per action call; the
      // per-file cap is MAX_PROFILE_FILE_BYTES in lib/profilePaths.ts, plus
      // room for the multipart overhead.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
