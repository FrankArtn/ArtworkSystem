import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "Artwork System",
  description: "Quotes & Inventory for the sign shop",
};


export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        <header style={{ borderBottom: "1px solid #eee", padding: "12px 20px", display: "flex", gap: 16, alignItems: "center" }}>
          <strong style={{ marginRight: 12 }}>Artwork System</strong>
          {/* 👇 add a class for the pipe styling */}
          <nav className="pipe-nav" style={{ display: "flex", gap: 12 }}>
            <Link href="/">Home</Link>
            <Link href="/products" className="hover:underline">Products</Link>
            <Link href="/quotes">Quotes</Link>
            <Link href="/orders">Orders</Link>
            <Link href="/materials">Materials</Link>
          </nav>
        </header>
        <main style={{ padding: 24, maxWidth: 1100, marginInline: "auto" }}>{children}</main>
      </body>
    </html>
  );
}
