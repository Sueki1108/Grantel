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
  devIndicators: {
    allowedDevOrigins: [
      '*.cluster-kc2r6y3mtba5mswcmol45orivs.cloudworkstations.dev',
    ],
  },
  webpack: (config, { isServer, dev }) => {
    // Adicionado para garantir que o 'xlsx' funcione no lado do servidor em produção.
    if (isServer && !dev) {
      config.externals.push({
        'xlsx': 'commonjs xlsx'
      });
    }
    return config;
  },
};

module.exports = nextConfig;
