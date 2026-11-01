import type { Metadata } from 'next';
import { EB_Garamond, Figtree, Roboto_Mono } from 'next/font/google';
import './globals.css';
import { DashboardNav } from './nav';

const figtree = Figtree({
  variable: '--font-figtree',
  subsets: ['latin'],
  display: 'swap',
});

const garamond = EB_Garamond({
  variable: '--font-garamond',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const robotoMono = Roboto_Mono({
  variable: '--font-roboto-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LilSteps — Clinical Dashboard',
  description: 'Paediatric consultation dashboard for LilSteps doctors.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-IN"
      className={`${figtree.variable} ${garamond.variable} ${robotoMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <DashboardNav />
        {children}
      </body>
    </html>
  );
}
