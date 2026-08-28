import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  /*
   * Pasta de saída do build.
   *
   * O `next dev` serve a aplicação a partir de `.next/`. Um `next build` rodado
   * com o dev server no ar sobrescreve os manifestos e os chunks que ele tem em
   * memória, e o dev passa a dar 404 de chunk até ser reiniciado. Builds de
   * verificação usam `npm run build:check`, que aponta NEXT_DIST_DIR para outra
   * pasta e deixa o dev server em paz. Sem a variável, nada muda.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
