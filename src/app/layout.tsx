import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "LabTest — Voice-labeled lab racks",
  description:
    "Label and query test-tube rack contents by voice. Visual and spreadsheet views with CSV/XLSX/PDF export.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "LabTest", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#3b82f6",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
