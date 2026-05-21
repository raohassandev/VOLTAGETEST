import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UPS Monitoring System",
  description: "Live UPS voltage, current, battery, and alarm monitoring",
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
