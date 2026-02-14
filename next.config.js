/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase body size limit for file uploads (default is 4MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    serverComponentsExternalPackages: ['@remotion/bundler', '@remotion/renderer', 'esbuild'],
  },
  webpack: (config) => {
    // Remotion compositor binaries are not needed in the browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@remotion/compositor-darwin-x64': false,
      '@remotion/compositor-darwin-arm64': false,
      '@remotion/compositor-linux-x64-gnu': false,
      '@remotion/compositor-linux-x64-musl': false,
      '@remotion/compositor-win32-x64-msvc': false,
      esbuild: false,
    };
    return config;
  },
}

module.exports = nextConfig
