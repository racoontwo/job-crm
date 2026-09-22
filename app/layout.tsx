import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import ApplicationListPanel from "@/components/ApplicationListPanel";

export const metadata: Metadata = {
  title: "Job CRM",
  description: "Track job applications and follow-ups",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex h-screen flex-col bg-neutral-50 text-neutral-900 antialiased">
        <header className="shrink-0 border-b border-neutral-200 bg-white">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Job CRM
            </Link>
            <Link
              href="/applications/new"
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              + New application
            </Link>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="w-full shrink-0 overflow-y-auto border-b border-neutral-200 bg-white md:h-full md:w-80 md:border-b-0 md:border-r">
            <ApplicationListPanel />
          </aside>
          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-8">
            <div className="mx-auto max-w-4xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
