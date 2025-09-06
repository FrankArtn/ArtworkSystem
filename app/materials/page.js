'use client';
import { useEffect, useState } from "react";

export default function MaterialsPage() {
  const [mats, setMats] = useState([]);
  const [sel, setSel] = useState("");
  const [qty, setQty] = useState(10);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const r = await fetch("/api/materials", { cache: "no-store" });
      const data = await r.json();
      setMats(data);
      if (!sel && data.length) setSel(String(data[0].id));
    } catch (e) {
      setErr("Failed to load materials");
    }
  }

  useEffect(() => { load(); }, []);

  async function addStock() {
    if (!sel) return;
    setLoading(true);
    setErr("");
    try {
      await fetch("/api/materials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ materialId: Number(sel), qty: Number(qty) }),
      });
      await load();
    } catch (e) {
      setErr("Failed to add stock");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{maxWidth: 800}}>
      <h2 className="text-2xl font-semibold mb-3">Materials</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}
      <table className="w-full border-collapse">
        <thead>
          <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:border-b">
            <th>Name</th><th>SKU</th><th>Unit</th><th>On hand</th>
          </tr>
        </thead>
        <tbody>
          {mats.map(m => (
            <tr key={m.id} className="[&>td]:py-2 [&>td]:border-b">
              <td>{m.name}</td>
              <td>{m.sku}</td>
              <td>{m.unit}</td>
              <td>{m.on_hand}</td>
            </tr>
          ))}
          {!mats.length && (
            <tr><td colSpan={4} className="py-4 text-neutral-500">No materials found.</td></tr>
          )}
        </tbody>
      </table>

      <div className="mt-4 flex gap-2 items-center">
        <select
          className="border rounded px-2 py-1"
          value={sel}
          onChange={e => setSel(e.target.value)}
        >
          <option value="" disabled>Select material</option>
          {mats.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input
          type="number"
          className="border rounded px-2 py-1 w-24"
          value={qty}
          onChange={e => setQty(e.target.value)}
          min="1"
        />
        <button
          onClick={addStock}
          disabled={loading || !sel}
          className="rounded bg-black text-white px-3 py-1 disabled:opacity-60"
        >
          {loading ? "Adding…" : "Add stock"}
        </button>
      </div>
    </div>
  );
}
