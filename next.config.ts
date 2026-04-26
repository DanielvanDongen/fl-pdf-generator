import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer needs canvas — mark as external for server builds
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "canvas"];
    }
    return config;
  },
};

export default nextConfig;
