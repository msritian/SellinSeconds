import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./providers";
import { Nav } from "./components/Nav";

export const metadata: Metadata = {
  title: "SellinSeconds – Campus Marketplace",
  description: "Buy, sell, and get help with delivery on campus",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-stone-50 text-stone-900">
        <AuthProvider>
          <Nav />
          <main className="flex-1">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
