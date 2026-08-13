import type { Metadata } from "next";
import { Barlow_Condensed, Bebas_Neue } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import OfflineSupport from "./offline-support";

const display = Bebas_Neue({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const body = Barlow_Condensed({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "Live performer run sheet and set order for Rad Dad + Friends at Guitars & Growlers on September 19, 2026.";

  return {
    title: "Rad Dad + Friends | Show Night",
    description,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Rad Dad Sets",
    },
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
      apple: "/icon-180.png",
    },
    openGraph: {
      title: "Rad Dad + Friends | Show Night",
      description,
      type: "website",
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "Rad Dad + Friends at Guitars & Growlers" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Rad Dad + Friends | Show Night",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export const viewport = { themeColor: "#07090c", viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable}`}>
        {children}
        <OfflineSupport />
      </body>
    </html>
  );
}
