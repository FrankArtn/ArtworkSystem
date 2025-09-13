'use client';
import { useEffect, useState } from "react";
import MaterialSelect from '@/app/components/MaterialSelect';

export default function MaterialsPage() {
  const [mats, setMats] = useState([]); // always an array
  const [sel, setSel] = useState("");
  const [qty, setQty] = useState(10);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // Add stock (unallocated) controls
  const [selAdd, setSelAdd] = useState("");
  const [addQty, setAddQty] = useState(10);
  const [adding, setAdding] = useState(false);
  const [addCost, setAddCost] = useState("");

  // Jobs dropdown
  const [jobs, setJobs] = useState([]);
  const [jobSel, setJobSel] = useState(""); // selected job_number

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

  async function loadJobs() {
    try {
      const r = await fetch("/api/orders/jobs?open=1", { cache: "no-store" });
      const data = await r.json().catch(() => []);
      if (r.ok && Array.isArray(data)) setJobs(data);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("GET /api/orders/jobs failed:", e);
    }
  }

  useEffect(() => { load(); loadJobs(); }, []);

  // Add to Unallocated
  async function addUnallocated() {
    if (!selAdd) return;
    const n = Number(addQty);
    if (!Number.isFinite(n) || n <= 0) { setErr("Quantity must be a positive number"); return; }

    setAdding(true);
    setErr("");
    try {
      const r = await fetch("/api/materials/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selAdd,
          delta: n,
          cost_price: addCost === "" ? undefined : Number(addCost),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "Add stock failed");
      await load();
      setAddCost(""); // reset the field on success
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to add stock");
    } finally {
      setAdding(false);
    }
  }

  // Transfer Unallocated → WIP
  async function transferToWip() {
    if (!sel) return;
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) { setErr("Quantity must be a positive number"); return; }
    if (!jobSel) { setErr("Please select a job"); return; }

    setLoading(true);
    setErr("");

    try {
      const r = await fetch("/api/materials/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: sel, qty: n, job_number: jobSel }), // <-- send job_number
      });

      if (!r.ok) {
        const raw = await r.text();
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.error("Transfer failed:", r.status, raw);
        }
        let msg = "Transfer failed";
        try { msg = JSON.parse(raw)?.error || msg; } catch {}
        if (r.status === 409 && !/insufficient/i.test(msg)) {
          msg = "Insufficient unallocated stock for this transfer";
        }
        throw new Error(msg);
      }

      await load(); // refresh table
      setJobSel("");
    } catch (e) {
      setErr(e.message || "Failed to transfer");
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
            <th>Cost price</th>
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
                <td>{typeof m.cost_price === "number" ? Number(m.cost_price).toFixed(2) : (m.cost_price ?? 0)}</td>
                <td>{m.unallocated_stock ?? 0}</td>
                <td>{m.wip_qty ?? 0}</td>
                <td>{m.stock_qty ?? ((m.unallocated_stock ?? 0) + (m.wip_qty ?? 0))}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Collapsible: Add stock to Unallocated */}
      <details className="group mt-4 border rounded-xl">
        <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3 select-none">
          <span className="font-medium">Add stock (increase Unallocated)</span>
          <Chevron />
        </summary>
        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
          <MaterialSelect
            items={mats}
            value={selAdd}
            onChange={setSelAdd}
            label="Material (add stock)"
            placeholder="Search name or SKU…"
            showStock
            showCost
          />

            <input
              type="number"
              className="border rounded px-2 py-1 w-24"
              value={addQty}
              onChange={e => setAddQty(e.target.value)}
              min="1"
            />
            <input
              type="number"
              step="0.01"
              className="border rounded px-2 py-1 w-28"
              value={addCost}
              onChange={e => setAddCost(e.target.value)}
              placeholder="Unit cost (opt)"
            />

            <button
              onClick={addUnallocated}
              disabled={adding || !selAdd}
              className="rounded bg-black text-white px-3 py-1 disabled:opacity-60"
            >
              {adding ? "Adding…" : "Add stock"}
            </button>
          </div>
          <p className="text-xs text-neutral-500 mt-2">
            If a unit cost is entered, the material’s <em>cost price</em> is recalculated as a
            weighted average using the current <strong>Unallocated</strong> quantity.
          </p>
        </div>
      </details>

      {/* Collapsible: Transfer unallocated → WIP */}
      <details className="group mt-6 border rounded-xl">
        <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3 select-none">
          <span className="font-medium">Start job (move Unallocated → WIP)</span>
          <Chevron />
        </summary>
        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <MaterialSelect
              items={mats}
              value={sel}
              onChange={setSel}
              label="Material"
              placeholder="Search name or SKU…"
              showStock
              className="w-82"
            />

            <input
              type="number"
              className="border rounded px-2 py-1 w-24"
              value={qty}
              onChange={e => setQty(e.target.value)}
              min="1"
            />

            {/* Job dropdown */}
            <select
              className="border rounded px-2 py-1"
              value={jobSel}
              onChange={(e) => setJobSel(e.target.value)}
            >
              <option value="" disabled>Select job</option>
              {jobs.map(j => (
                <option key={`job-${j.id}`} value={j.job_number}>
                  {j.job_number}{j.quote_number ? ` — ${j.quote_number}` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="border rounded px-2 py-1"
              onClick={loadJobs}
              title="Refresh jobs"
            >
              ↻
            </button>

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
