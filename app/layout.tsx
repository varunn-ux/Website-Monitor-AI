import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Website Monitor AI', description: 'Website health, links, SEO and performance monitoring dashboard.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
