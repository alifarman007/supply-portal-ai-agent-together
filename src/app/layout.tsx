import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Hind_Siliguri } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-hind",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kazi Farms Supplier Portal",
  description:
    "Supplier portal for Kazi Farms Group — manage purchase orders, invoices, payments, and compliance.",
  icons: {
    icon: "/brand/icon-32.png",
    apple: "/brand/icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#dc2626",
};

const noFlashScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem("kazifarms-theme");d.setAttribute("data-theme",t==="dark"?"dark":"light");var l=localStorage.getItem("kazifarms-lang");d.setAttribute("lang",l==="bn"?"bn":"en");}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${jakarta.variable} ${hindSiliguri.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
