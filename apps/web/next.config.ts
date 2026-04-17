import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async redirects() {
    return [
      { source: '/chat', destination: '/app', permanent: false },
      { source: '/settings', destination: '/connect', permanent: false },
      { source: '/dashboard', destination: '/app', permanent: false },
      { source: '/usage', destination: '/app', permanent: false },
      { source: '/providers', destination: '/connect', permanent: false },
      { source: '/x-accounts', destination: '/connect', permanent: false },
      { source: '/topics', destination: '/app', permanent: false },
      { source: '/drafts', destination: '/queue', permanent: false },
      { source: '/learning', destination: '/connect', permanent: false },
      { source: '/voice-profiles', destination: '/connect', permanent: false },
      { source: '/playbooks', destination: '/connect', permanent: false },
      { source: '/naturalization', destination: '/app', permanent: false },
      { source: '/media', destination: '/app', permanent: false },
      { source: '/publish-queue', destination: '/queue', permanent: false },
      { source: '/reply-queue', destination: '/queue', permanent: false },
      { source: '/workflow', destination: '/app', permanent: false },
      { source: '/audit', destination: '/queue', permanent: false }
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos'
      }
    ]
  }
};

export default nextConfig;
