import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Ehsaan Khata",
  description: "Keep track of favours in your group with Ehsaan Points.",
  appleWebApp: { capable: true, title: "Ehsaan Khata", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ffd23f",
  // Always light, even when the phone or browser is in dark mode (also opts out of Chrome's auto-darkening).
  colorScheme: "only light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} antialiased`}>
      {/* min-h-dvh follows the phone's visible height as the address bar shows/hides, so short pages don't scroll. */}
      <body className="flex min-h-dvh flex-col">
        <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">{children}</main>
        <footer className="mx-auto w-full max-w-xl px-4 pb-8 text-center text-sm text-muted">
          Made with 💛 by{" "}
          <a
            href="https://gr4mpus.github.io/portfolio/"
            target="_blank"
            rel="noopener noreferrer"
            className="brand font-bold text-foreground underline-offset-4 hover:underline"
          >
            gr4mpus
          </a>
        </footer>
      </body>
    </html>
  );
}
