import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '../lib/providers';

export const metadata: Metadata = {
  title: 'DraftOrbit — Chat-first X 内容运营助手',
  description: '一句话意图输入，自动生成短推/串推/文章并完成审批发布'
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
