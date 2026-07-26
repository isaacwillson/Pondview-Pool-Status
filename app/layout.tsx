import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { PHProvider } from "@/components/posthog-provider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pondview Pool Status — Live Amenity Dashboard",
  description:
    "Real-time pool occupancy, crowd levels, and weather conditions for Pondview residents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body className="min-h-screen page-gradient antialiased">
        <PHProvider>{children}</PHProvider>
      </body>
    </html>
  );
}
