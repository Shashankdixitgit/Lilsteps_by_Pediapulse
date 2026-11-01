import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { DevFeedback } from './dev-feedback';
import { DashboardNav } from './nav';

const inter = Inter({
  variable: '--font-inter',
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
      className={`${inter.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <DashboardNav />
        {children}
        <DevFeedback />
      </body>
    </html>
  );
}
