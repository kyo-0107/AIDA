import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DIGIT",
  description: "DIGIT要件定義書にもとづく、マルチツール タスク統合 & AIプロジェクト計画支援システム",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;600;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
