import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '../lib/providers';

export const metadata: Metadata = {
  title: 'DraftOrbit — AI 推文生成',
  description: '输入想法，AI 推理生成，一键发推'
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
