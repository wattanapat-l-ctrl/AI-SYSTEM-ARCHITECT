import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "AI System Architect",
    template: "%s \u00b7 AI System Architect",
  },
  description:
    "Design software architecture and REST APIs, estimate infrastructure cost, record decisions, and review your design with AI.",
  applicationName: "AI System Architect",
  keywords: [
    "system architecture",
    "C4 model",
    "API design",
    "OpenAPI",
    "Supabase",
    "infrastructure cost",
  ],
  authors: [{ name: "AI System Architect" }],
  openGraph: {
    title: "AI System Architect",
    description:
      "Design, document, cost and review software architecture and Web APIs in one workspace.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#080b14" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
