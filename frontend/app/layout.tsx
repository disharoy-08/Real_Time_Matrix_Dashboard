import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SpectraPulse | Distributed Real-Time Telemetry Dashboard',
  description:
    'High-throughput real-time telemetry dashboard powered by Go, WebSockets, Redis Pub/Sub, and PostgreSQL with zero packet drop verification.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full bg-[#080c14] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-300">
        {children}
      </body>
    </html>
  );
}
