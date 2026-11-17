// Next.js config. Workspace packages ship TypeScript source, so Next must transpile them.
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@sta/shared'],
};

export default nextConfig;
