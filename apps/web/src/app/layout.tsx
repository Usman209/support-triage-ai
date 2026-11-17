// Root layout: global styles and top navigation.
// TODO task 3: switch to shadcn/ui components.
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Support Triage AI',
  description: 'Support-ticket triage assistant',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/" className="brand">
            Support Triage AI
          </Link>
          <Link href="/chat">Chat</Link>
          <Link href="/approvals">Approvals</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
