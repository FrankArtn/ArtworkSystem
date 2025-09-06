import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen grid grid-rows-[auto_1fr_auto]">
      <main className="px-6 sm:px-10 py-10 mx-auto w-full max-w-5xl">
        <h1 className="text-3xl font-semibold">Artwork System</h1>
        <p className="mt-2 text-neutral-600">Quote jobs, manage materials, and auto-deduct stock when orders complete.</p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Link href="/quotes/new" className="inline-flex items-center justify-center rounded-md bg-black text-white px-4 py-2 font-medium hover:bg-neutral-800">
            Create a Quote
          </Link>
          <Link href="/materials" className="inline-flex items-center justify-center rounded-md border px-4 py-2 font-medium hover:bg-neutral-50">
            View Materials
          </Link>
          <Link href="/orders" className="inline-flex items-center justify-center rounded-md border px-4 py-2 font-medium hover:bg-neutral-50">
            Orders
          </Link>
        </div>
      </main>
      <footer className="row-start-3 py-6 text-center text-sm text-neutral-500">
        © {new Date().getFullYear()} Artwork System
      </footer>
    </div>
  );
}
