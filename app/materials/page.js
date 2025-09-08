'use client';
import { useEffect, useState } from "react";

export default function MaterialsPage() {
  const [mats, setMats] = useState([]); // always an array
  const [sel, setSel] = useState("");
  const [qty, setQty] = useState(10);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // new material form (no "on hand" — use initialUnallocated → unallocated_stock)
  const [form, setForm] = useState({
    name: "",
    sku: "",
    unit: "m2",
    costPerUnit: "",
    reorderLevel: "",       // kept for UI only (not used by API yet)
    initialUnallocated: "", // sent to unallocated_stock at create time
  });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  async function load() {
    setErr("");
    try {
      const r = await fetch("/api/materials", { cache: "no-store" });
      if (!r.ok) {
        try { console.error("GET /api/materials failed:", await r.text()); } catch {}
        setMats([]);
        return;
      }
      const data = await r.json();
      const rows = Array.isArray(data) ? data : [];
      setMats(rows);
      if (!sel && rows.length) setSel(String(rows[0].id));
    } catch (e) {
      console.error(e);
      setErr("Failed to load materials");
      setMats([]);
    }
  }
  useEffect(() => { load(); }, []);

  // Transfer Unallocated → WIP (requires /api/materials/transfer to use unallocated_stock)
  async function transferToWip() {
    if (!sel) return;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/materials/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: Number(sel), qty: Number(qty) }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(txt || "transfer failed");
      }
      await load();
    } catch (e) {
      console.error(e);
      setErr("Failed to transfer (is /api/materials/transfer implemented for unallocated → WIP?)");
    } finally {
      setLoading(false);
    }
  }

  async function createMaterial(e) {
    e.preventDefault();
    setCreateMsg("");
    setErr("");
    setCreating(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        unit: form.unit,
        cost_price: form.costPerUnit === "" ? 0 : Number(form.costPerUnit),
        sell_price: 0, // adjust later if needed
        // Initial unallocated stock (replaces old "on hand")
        unallocated_stock: form.initialUnallocated === "" ? 0 : Number(form.initialUnallocated),
        // wip_qty omitted -> defaults to 0
      };

      const r = await fetch("/api/materials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data?.error || "Failed to create material");
      } else {
        setCreateMsg(`Created: ${payload.name}`);
        setForm({
          name: "", sku: "", unit: "m2", costPerUnit: "",
          reorderLevel: "", initialUnallocated: ""
        });
        await load();
      }
    } catch (e) {
      console.error(e);
      setErr("Failed to create material");
    } finally {
      setCreating(false);
    }
  }

  const rows = Array.isArray(mats) ? mats : [];

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-semibold mb-3">Materials</h2>
      {err && <p className="text-red-600 mb-2">{err}</p>}

      {/* Table */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:border-b">
            <th>Name</th>
            <th>SKU</th>
            <th>Unit</th>
            <th>Sell price</th>
            <th>Unallocated</th>
            <th>WIP</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="py-4 text-neutral-500">No materials found.</td></tr>
          ) : (
            rows.map((m) => (
              <tr key={m.id} className="[&>td]:py-2 [&>td]:border-b">
                <td>{m.name}</td>
                <td>{m.sku ? m.sku : <span className="text-neutral-400">—</span>}</td>
                <td>{m.unit || "—"}</td>
                <td>{m.sell_price ?? 0}</td>
                <td>{m.unallocated_stock ?? 0}</td>
                <td>{m.wip_qty ?? 0}</td>
                <td>{m.stock_qty ?? ((m.unallocated_stock ?? 0) + (m.wip_qty ?? 0))}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Collapsible: Transfer unallocated → WIP */}
      <details className="group mt-6 border rounded-xl">
        <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3 select-none">
          <span className="font-medium">Start job (move Unallocated → WIP)</span>
          <Chevron />
        </summary>
        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="border rounded px-2 py-1"
              value={sel}
              onChange={e => setSel(e.target.value)}
            >
              <option value="" disabled>Select material</option>
              {rows.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input
              type="number"
              className="border rounded px-2 py-1 w-24"
              value={qty}
              onChange={e => setQty(e.target.value)}
              min="1"
            />
            <button
              onClick={transferToWip}
              disabled={loading || !sel}
              className="rounded bg-black text-white px-3 py-1 disabled:opacity-60"
            >
              {loading ? "Transferring…" : "Transfer to WIP"}
            </button>
          </div>
        </div>
      </details>

      {/* Collapsible: Create new material */}
      <details className="group mt-4 border rounded-xl">
        <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3 select-none">
          <span className="font-medium">Create new material</span>
          <Chevron />
        </summary>
        <div className="px-4 pb-4">
          {createMsg && <p className="text-green-700 mb-2">{createMsg}</p>}
          <form onSubmit={createMaterial} className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm text-neutral-700">Name*</span>
              <input
                className="border rounded px-2 py-1"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-neutral-700">SKU</span>
              <input
                className="border rounded px-2 py-1"
                value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="Optional, must be unique"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-neutral-700">Unit*</span>
              <select
                className="border rounded px-2 py-1"
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
              >
                <option value="m2">m²</option>
                <option value="lm">lm</option>
                <option value="ea">each</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-neutral-700">Cost per unit*</span>
              <input
                type="number"
                step="0.01"
                className="border rounded px-2 py-1"
                value={form.costPerUnit}
                onChange={e => setForm(f => ({ ...f, costPerUnit: e.target.value }))}
                required
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-neutral-700">Reorder level</span>
              <input
                type="number"
                step="0.01"
                className="border rounded px-2 py-1"
                value={form.reorderLevel}
                onChange={e => setForm(f => ({ ...f, reorderLevel: e.target.value }))}
                placeholder="0"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-neutral-700">Initial unallocated</span>
              <input
                type="number"
                step="1"
                min="0"
                className="border rounded px-2 py-1"
                value={form.initialUnallocated}
                onChange={e => setForm(f => ({ ...f, initialUnallocated: e.target.value }))}
                placeholder="0"
              />
            </label>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded bg-black text-white px-3 py-1 disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create material"}
              </button>
            </div>
          </form>
        </div>
      </details>
    </div>
  );
}

/** Little chevron icon that rotates when <details> is open */
function Chevron() {
  return (
    <svg
      className="size-4 transition-transform group-open:rotate-180"
      viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
    >
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.18l3.71-2.95a.75.75 0 11.94 1.16l-4.24 3.37a.75.75 0 01-.94 0L5.21 8.39a.75.75 0 01.02-1.18z" clipRule="evenodd" />
    </svg>
  );
}
