/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don’t bundle optional DB drivers; they’ll only be required at runtime
      // if you flip DB_PROVIDER later.
      config.externals = config.externals || [];
      config.externals.push({
        pg: "commonjs pg",
        "better-sqlite3": "commonjs better-sqlite3",
      });
    }
    return config;
  },
};

export default nextConfig;
