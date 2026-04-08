import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '../lib/providers';

export const metadata: Metadata = {
  title: 'DraftOrbit — 一句话生成可发的 X 内容',
  description: '你说一句话，DraftOrbit 帮你生成、整理并准备可发的 X 内容。'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
