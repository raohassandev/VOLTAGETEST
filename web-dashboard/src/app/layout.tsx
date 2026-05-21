import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UMS — UPS Monitoring | Automatrix",
  description: "Industrial UPS Monitoring System by Automatrix Engineering",
  icons: {
    icon: "/brand/favicon.png",
    apple: "/brand/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
