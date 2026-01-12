/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
// O GitHub Actions define a variável GITHUB_ACTIONS como true
const basePath = process.env.NODE_ENV === 'production' ? '/Grantel' : '';

const nextConfig = {
  /* config options here */
  output: 'export',
  basePath: basePath,
  assetPrefix: basePath ? `${basePath}/` : '',
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
