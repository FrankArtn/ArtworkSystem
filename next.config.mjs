// next.config.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tell Turbopack exactly which directory is the project root
  turbopack: {
    root: path.join(__dirname),
    // If you had webpack aliases you need in Turbopack, mirror them here:
    // resolveAlias: { /* 'old': 'new' */ },
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Keep your DB drivers external so they aren’t bundled
      config.externals = config.externals || [];
      config.externals.push({
        pg: 'commonjs pg',
        'better-sqlite3': 'commonjs better-sqlite3',
      });
    }
    return config;
  },
};

export default nextConfig;