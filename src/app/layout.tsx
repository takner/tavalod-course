import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import "./globals.css";

const vazirmatn = localFont({
  src: [
    { path: "../fonts/vazirmatn-arabic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/vazirmatn-arabic-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/vazirmatn-arabic-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../fonts/vazirmatn-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/vazirmatn-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "تولد", template: "%s · تولد" },
  description: "هماهنگی جمع دوستان، از برنامه‌ریزی تا تسویه",
  applicationName: "تولد",
  appleWebApp: { capable: true, title: "تولد", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#111615" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
