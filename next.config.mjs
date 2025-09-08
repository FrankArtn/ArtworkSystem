/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Treat optional DB drivers as externals so webpack doesn’t try to resolve them
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
