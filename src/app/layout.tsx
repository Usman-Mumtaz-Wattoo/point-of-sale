import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Point of Sale SaaS",
  description: "Point of Sale SaaS Prototype",
};

import { ThemeProvider } from "@/components/theme-provider";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head suppressHydrationWarning>
        <script
          id="pos-theme-init"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('pos_theme');var p=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(!s&&p)){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-slate-50 text-slate-900 dark:bg-[#080d1a] dark:text-slate-100 transition-colors duration-150"
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
