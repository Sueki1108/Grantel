/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // Adicionado para garantir que o 'xlsx' funcione no lado do servidor.
    if (isServer) {
      config.externals.push({
        'xlsx': 'commonjs xlsx'
      });
    }
    return config;
  },
};

module.exports = nextConfig;
