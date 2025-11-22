/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Ignore optional dependencies that are not needed in the browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'pino-pretty': false,
        'encoding': false,
      }
    }
    return config
  },
}

module.exports = nextConfig

