/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase body size limit for file uploads (default is 4MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

module.exports = nextConfig
