/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const basePath = isProd ? '/Grantel' : '';
const assetPrefix = isProd ? '/Grantel/' : '';

const nextConfig = {
  /* config options here */
  ...(isProd && { output: 'export' }),
  basePath: basePath,
  assetPrefix: assetPrefix,
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
  webpack: (config, { isServer, dev }) => {
    // Adicionado para garantir que o 'xlsx' funcione no lado do servidor em produção.
    if (isServer && !dev) {
      config.externals.push({
        'xlsx': 'commonjs xlsx'
      });
    }
    
    // Resolver paths do TypeScript
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, 'src'),
    };
    
    return config;
  },
};

module.exports = nextConfig;
