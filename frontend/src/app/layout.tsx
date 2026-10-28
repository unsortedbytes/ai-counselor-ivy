import type { Metadata } from "next";
import { Lexend } from "next/font/google";
import { AppHeader } from "@/components/AppHeader";
import { AuthProvider } from "@/lib/auth";
import { HeaderProvider } from "@/lib/header";
import "./globals.css";

const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "helloivy · Essay Brainstorming",
  description: "Brainstorm your college essay with Ivy, an AI coach, and leave with a word-by-word essay structure.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${lexend.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <AuthProvider>
          <HeaderProvider>
            <AppHeader />
            <div className="flex flex-1 flex-col">{children}</div>
          </HeaderProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
