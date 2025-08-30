import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import Footer from "./components/Footer";
/* =========================================================
   CODE SETS (starter defaults, m² per person)
   Note: Values here are generic starters — verify per your jurisdiction.
   You can edit per-code factors in the UI; edits persist in localStorage.
   ========================================================= */
const CODE_SETS = {
  IBC_2024: {
    label: "IBC 2024 (Table 1004.5)",
    factors: {
      Retail: 2.8,
      Restaurant: 1.4,
      Administrative: 9.3,
      Mechanical: 28,
    },
  },
  IBC_2021: { label: "IBC 2021", factors: { Retail: 2.8, Restaurant: 1.4, Administrative: 9.3, Mechanical: 28 } },
  NFPA_101_2024: { label: "NFPA 101 (2024)", factors: { Retail: 2.8, Restaurant: 1.4, Administrative: 9.3, Mechanical: 28 } },
  UK_ADB_2023: { label: "UK Approved Document B (2023)", factors: { Retail: 2.8, Restaurant: 1.4, Administrative: 9.3, Mechanical: 28 } },
  NCC_AU_2022: { label: "Australia NCC (2022)", factors: { Retail: 2.8, Restaurant: 1.4, Administrative: 9.3, Mechanical: 28 } },
  NBC_CA_2020: { label: "Canada NBC (2020)", factors: { Retail: 2.8, Restaurant: 1.4, Administrative: 9.3, Mechanical: 28 } },
  SBC_SA_2018: { label: "Saudi SBC (2018+)", factors: { Retail: 2.8, Restaurant: 1.4, Administrative: 9.3, Mechanical: 28 } },
  UAE_FireCode_2018: { label: "UAE Fire & Life Safety (2018+)", factors: { Retail: 2.8, Restaurant: 1.4, Administrative: 9.3, Mechanical: 28 } },
  EU_Guidance: { label: "EU Guidance (generic)", factors: { Retail: 2.8, Restaurant: 1.4, Administrative: 9.3, Mechanical: 28 } },
};

// localStorage helpers (persist your edited factors per code)
const LS_KEY = "occuCalc.codeOverrides.v1";

// -------------------- Helpers --------------------
const normalizeType = (t, available) => {
  const val = (t || "").toString().trim();
  return available.includes(val) ? val : available[0] || "Retail";
};

const loadFrom = (area, factorMap, type) => {
  const a = Number(area);
  const f = factorMap[type] ?? factorMap["Retail"] ?? 1;
  return Number.isFinite(a) && a > 0 ? Math.ceil(a / f) : 0;
};

// -------------------- Component --------------------
export default function OccuCalcTools() {
  // Mode + Code selection
  const [mode, setMode] = useState("manual"); // "manual" | "upload"
  const [codeId, setCodeId] = useState("IBC_2024");

  // Per-code custom overrides (persisted)
  const [overrides, setOverrides] = useState({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setOverrides(JSON.parse(raw));
    } catch { }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(overrides));
    } catch { }
  }, [overrides]);

  // Active factor map for current code (defaults + overrides)
  const baseFactors = CODE_SETS[codeId].factors;
  const currentFactors = useMemo(
    () => ({ ...baseFactors, ...(overrides[codeId] || {}) }),
    [baseFactors, overrides, codeId]
  );
  const typeList = useMemo(() => Object.keys(currentFactors), [currentFactors]);

  // Manual rows (compact shape)
  const [manualRows, setManualRows] = useState([
    { id: 1, number: "1", name: "Space 1", area: "", type: typeList[0] || "Retail" },
  ]);
  useEffect(() => {
    // when switching codes, align types that no longer exist
    setManualRows((prev) =>
      prev.map((r) => ({ ...r, type: normalizeType(r.type, typeList) }))
    );
  }, [typeList]);

  // Upload/edit rows (header-style keys)
  const [gridRows, setGridRows] = useState([]);
  useEffect(() => {
    // when switching codes, re-evaluate loads & types
    setGridRows((prev) =>
      prev.map((r) => {
        const t = normalizeType(r["Occupancy Type"], typeList);
        return {
          ...r,
          "Occupancy Type": t,
          "Occupant Load": loadFrom(r["Area (m²)"], currentFactors, t),
        };
      })
    );
  }, [currentFactors, typeList]);

  // Totals (derived)
  const { totals, grandTotal } = useMemo(() => {
    const rows =
      mode === "manual"
        ? manualRows.map((r) => ({
          "Room #": r.number,
          "Room Name": r.name,
          "Area (m²)": r.area,
          "Occupancy Type": r.type,
          "Occupant Load": loadFrom(r.area, currentFactors, r.type),
        }))
        : gridRows;

    const grouped = {};
    let sum = 0;
    rows.forEach((r) => {
      const t = normalizeType(r["Occupancy Type"], typeList);
      const l = Number(r["Occupant Load"]) || 0;
      grouped[t] = (grouped[t] || 0) + l;
      sum += l;
    });
    return { totals: grouped, grandTotal: sum };
  }, [mode, manualRows, gridRows, currentFactors, typeList]);

  // -------------------- Handlers --------------------
  const handleModeChange = (e) => setMode(e.target.value);
  const handleCodeChange = (e) => setCodeId(e.target.value);

  // Manual CRUD
  const addManualRow = () =>
    setManualRows((prev) => {
      const id = prev.length ? Math.max(...prev.map((x) => x.id)) + 1 : 1;
      return [...prev, { id, number: String(id), name: `Space ${id}`, area: "", type: typeList[0] || "Retail" }];
    });

  const removeManualRow = (id) => setManualRows((prev) => prev.filter((r) => r.id !== id));
  const changeManual = (id, key, val) =>
    setManualRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
            ...r,
            [key]: key === "type" ? normalizeType(val, typeList) : val,
          }
          : r
      )
    );
  const clearManual = () =>
    setManualRows([{ id: 1, number: "1", name: "Space 1", area: "", type: typeList[0] || "Retail" }]);

  // Upload
  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }).map((row, i) => {
        const rawType = row["Occupancy Type"] ?? row["Type"];
        const type = normalizeType(rawType, typeList);
        const area = row["Area (m²)"] ?? row["Area"] ?? "";
        return {
          id: i + 1,
          "Room #": String(row["Room #"] ?? row["Room Number"] ?? i + 1),
          "Room Name": String(row["Room Name"] ?? row["Name"] ?? `Space ${i + 1}`),
          "Area (m²)": area,
          "Occupancy Type": type,
          "Occupant Load": loadFrom(area, currentFactors, type),
        };
      });
      setGridRows(rows);
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  const changeGrid = (id, key, val) =>
    setGridRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, [key]: val };
        const t = key === "Occupancy Type" ? normalizeType(val, typeList) : normalizeType(next["Occupancy Type"], typeList);
        next["Occupancy Type"] = t;
        next["Occupant Load"] = loadFrom(next["Area (m²)"], currentFactors, t);
        return next;
      })
    );
  const addGridRow = () =>
    setGridRows((prev) => {
      const id = prev.length ? Math.max(...prev.map((x) => x.id)) + 1 : 1;
      return [
        ...prev,
        { id, "Room #": String(id), "Room Name": `Space ${id}`, "Area (m²)": "", "Occupancy Type": typeList[0] || "Retail", "Occupant Load": 0 },
      ];
    });
  const removeGridRow = (id) => setGridRows((prev) => prev.filter((r) => r.id !== id));
  const clearGrid = () => setGridRows([]);

  // Exports
  const exportExcel = () => {
    const rows =
      mode === "manual"
        ? manualRows.map((r) => ({
          "Room #": r.number,
          "Room Name": r.name,
          "Area (m²)": r.area,
          "Occupancy Type": r.type,
          "Occupant Load": loadFrom(r.area, currentFactors, r.type),
        }))
        : gridRows;

    const ws = XLSX.utils.json_to_sheet(rows, { header: ["Room #", "Room Name", "Area (m²)", "Occupancy Type", "Occupant Load"] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Occupancy");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    saveAs(new Blob([buf], { type: "application/octet-stream" }), "occupancy_data.xlsx");
  };

  const exportPDFSummary = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    let y = 64;
    doc.setFontSize(18);
    doc.text(`Occupancy Summary – ${CODE_SETS[codeId].label}`, 40, y);
    y += 24;

    doc.setFontSize(12);
    Object.entries(totals).forEach(([type, count]) => {
      doc.text(`${type}: ${count} occupants`, 40, y);
      y += 16;
    });

    y += 10;
    doc.setFontSize(14);
    doc.text(`Grand Total: ${grandTotal} occupants`, 40, y);
    doc.save("occupancy_summary.pdf");
  };

  const exportPDFDetailed = () => {
    const rows =
      mode === "manual"
        ? manualRows.map((r) => ({
          "Room #": r.number,
          "Room Name": r.name,
          "Area (m²)": r.area,
          "Occupancy Type": r.type,
          "Occupant Load": loadFrom(r.area, currentFactors, r.type),
        }))
        : gridRows;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    let y = 64;
    doc.setFontSize(18);
    doc.text(`Occupancy Detailed Report – ${CODE_SETS[codeId].label}`, 40, y);
    y += 24;

    doc.setFontSize(10);
    doc.text("Room #", 40, y);
    doc.text("Room Name", 110, y);
    doc.text("Area (m²)", 280, y);
    doc.text("Type", 360, y);
    doc.text("Load", 460, y);
    y += 12;
    doc.line(40, y, 520, y);
    y += 12;

    rows.forEach((r) => {
      if (y > 760) {
        doc.addPage();
        y = 64;
      }
      doc.text(String(r["Room #"]), 40, y);
      doc.text(String(r["Room Name"]), 110, y);
      doc.text(String(r["Area (m²)"]), 280, y);
      doc.text(String(r["Occupancy Type"]), 360, y);
      doc.text(String(r["Occupant Load"]), 460, y);
      y += 14;
    });

    y += 12;
    doc.setFontSize(12);
    doc.text(`Grand Total: ${grandTotal} occupants`, 40, y);
    doc.save("occupancy_detailed.pdf");
  };

  // Factor editor UI state
  const [showEditor, setShowEditor] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  const setFactorFor = (type, value) => {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return;
    setOverrides((prev) => ({
      ...prev,
      [codeId]: { ...(prev[codeId] || {}), [type]: v },
    }));
  };

  const resetCodeToDefaults = () =>
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[codeId];
      return next;
    });

  const addNewType = () => {
    const name = newTypeName.trim();
    if (!name || typeList.includes(name)) return;
    setOverrides((prev) => ({
      ...prev,
      [codeId]: { ...(prev[codeId] || {}), [name]: 10 }, // default 10 m²/person; user can change
    }));
    setNewTypeName("");
  };

  const deleteType = (type) => {
    // remove only if it's an override (not a base factor)
    if (Object.prototype.hasOwnProperty.call(baseFactors, type)) return;
    setOverrides((prev) => {
      const curr = { ...(prev[codeId] || {}) };
      delete curr[type];
      return { ...prev, [codeId]: curr };
    });
  };

  // -------------------- UI --------------------
  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>🏢 OccuCalc</h1>
      <p style={{ color: "#444", marginTop: 6 }}>
        Calculate occupant loads (m²/person) using selectable code sets. You can edit per-code factors below.
      </p>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 12,
          marginTop: 12,
        }}
      >
        <label><strong>Mode:</strong></label>
        <select value={mode} onChange={handleModeChange} style={{ padding: "6px 10px", borderRadius: 8 }}>
          <option value="manual">Manual entry</option>
          <option value="upload">Upload Excel</option>
        </select>

        <label style={{ marginLeft: 8 }}><strong>Code:</strong></label>
        <select value={codeId} onChange={handleCodeChange} style={{ padding: "6px 10px", borderRadius: 8, minWidth: 220 }}>
          {Object.entries(CODE_SETS).map(([id, cfg]) => (
            <option key={id} value={id}>{cfg.label}</option>
          ))}
        </select>

        <button onClick={() => setShowEditor((s) => !s)} style={btn("ghost")}>
          {showEditor ? "Hide factors" : "Edit factors"}
        </button>

        {mode === "upload" && (
          <>
            <input type="file" accept=".xlsx,.xls" onChange={handleUpload} title="Upload Excel" />
          </>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={exportExcel} style={btn()}>Export Excel</button>
          <button onClick={exportPDFSummary} style={btn()}>PDF Summary</button>
          <button onClick={exportPDFDetailed} style={btn()}>PDF Detailed</button>
        </div>
      </div>

      {/* Factor editor */}
      {showEditor && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong>Factors for: {CODE_SETS[codeId].label}</strong>
            <button onClick={resetCodeToDefaults} style={btn("danger")}>Reset to defaults</button>
          </div>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={table()}>
              <thead>
                <tr>
                  <th style={th(260)}>Occupancy Type</th>
                  <th style={th(180)}>Factor (m²/person)</th>
                  <th style={th(120)}></th>
                </tr>
              </thead>
              <tbody>
                {typeList.map((t) => (
                  <tr key={t}>
                    <td style={td(260)}>{t}</td>
                    <td style={td(180)}>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={currentFactors[t]}
                        onChange={(e) => setFactorFor(t, e.target.value)}
                        style={input(160)}
                      />
                    </td>
                    <td style={td(120)}>
                      {!Object.prototype.hasOwnProperty.call(baseFactors, t) && (
                        <button onClick={() => deleteType(t)} style={btn("danger")}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={td(260)}>
                    <input
                      placeholder="Add new type (e.g., Assembly – standing)"
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                      style={input(240)}
                    />
                  </td>
                  <td style={td(180)}>
                    <em style={{ color: "#666" }}>Default 10 m²/person (editable after adding)</em>
                  </td>
                  <td style={td(120)}>
                    <button onClick={addNewType} style={btn()}>Add type</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ color: "#888", marginTop: 8 }}>
            These are convenience defaults. Always verify factors against the official code text adopted in your project’s jurisdiction.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, marginTop: 16 }}>
        {/* Left: Tables */}
        <div>
          {mode === "manual" ? (
            <ManualTable
              rows={manualRows}
              types={typeList}
              onAdd={addManualRow}
              onRemove={removeManualRow}
              onChange={changeManual}
              onClear={clearManual}
            />
          ) : (
            <GridTable
              rows={gridRows}
              types={typeList}
              onAdd={addGridRow}
              onRemove={removeGridRow}
              onChange={changeGrid}
              onClear={clearGrid}
            />
          )}
        </div>

        {/* Right: Totals */}
        <aside style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, height: "fit-content" }}>
          <h3 style={{ marginTop: 0 }}>Totals</h3>
          <div style={{ marginBottom: 8, color: "#666" }}>Code: {CODE_SETS[codeId].label}</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {typeList.map((t) => (
              <li key={t} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                <span>{t}</span>
                <strong>{totals[t] || 0}</strong>
              </li>
            ))}
          </ul>
          <hr style={{ margin: "12px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Grand Total</span>
            <strong>{grandTotal}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ===================== Sub-components ===================== */
function ManualTable({ rows, types, onAdd, onRemove, onChange, onClear }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: 12, display: "flex", gap: 8, alignItems: "center", background: "#fafafa" }}>
        <strong>Manual Entry</strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={onAdd} style={btn()}>Add row</button>
          <button onClick={onClear} style={btn("ghost")}>Clear</button>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={table()}>
          <thead>
            <tr>
              <th style={th(80)}>#</th>
              <th style={th()}>Room Name</th>
              <th style={th(120)}>Area (m²)</th>
              <th style={th(200)}>Occupancy Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td(80)}>
                  <input value={r.number} onChange={(e) => onChange(r.id, "number", e.target.value)} style={input(70)} />
                </td>
                <td style={td()}>
                  <input value={r.name} onChange={(e) => onChange(r.id, "name", e.target.value)} style={input()} />
                </td>
                <td style={td(120)}>
                  <input
                    value={r.area}
                    onChange={(e) => onChange(r.id, "area", e.target.value)}
                    style={input(100)}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </td>
                <td style={td(200)}>
                  <select value={r.type} onChange={(e) => onChange(r.id, "type", e.target.value)} style={select(180)}>
                    {types.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 16, textAlign: "center", color: "#666" }}>
                  No rows. Click <em>Add row</em> to start.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GridTable({ rows, types, onAdd, onRemove, onChange, onClear }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: 12, display: "flex", gap: 8, alignItems: "center", background: "#fafafa" }}>
        <strong>Uploaded / Editable Grid</strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={onAdd} style={btn()}>Add row</button>
          <button onClick={onClear} style={btn("ghost")}>Clear</button>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={table()}>
          <thead>
            <tr>
              <th style={th(80)}>Room #</th>
              <th style={th()}>Room Name</th>
              <th style={th(120)}>Area (m²)</th>
              <th style={th(200)}>Occupancy Type</th>
              <th style={th(80)}>Load</th>
              <th style={th(40)}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td(80)}>
                  <input value={r["Room #"]} onChange={(e) => onChange(r.id, "Room #", e.target.value)} style={input(70)} />
                </td>
                <td style={td()}>
                  <input value={r["Room Name"]} onChange={(e) => onChange(r.id, "Room Name", e.target.value)} style={input()} />
                </td>
                <td style={td(120)}>
                  <input
                    value={r["Area (m²)"]}
                    onChange={(e) => onChange(r.id, "Area (m²)", e.target.value)}
                    style={input(100)}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </td>
                <td style={td(200)}>
                  <select
                    value={r["Occupancy Type"]}
                    onChange={(e) => onChange(r.id, "Occupancy Type", e.target.value)}
                    style={select(180)}
                  >
                    {types.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </td>
                <td style={td(80)}>
                  <div style={pill()}>{r["Occupant Load"]}</div>
                </td>
                <td style={td(40)}>
                  <button onClick={() => onRemove(r.id)} style={btn("danger")}>×</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#666" }}>
                  Upload an Excel file or click <em>Add row</em> to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ===================== Tiny style helpers ===================== */
function btn(variant = "primary") {
  const base =
    variant === "danger"
      ? { background: "#ef4444", color: "#fff", border: "1px solid #dc2626" }
      : variant === "ghost"
        ? { background: "#fff", color: "#111", border: "1px solid #e5e7eb" }
        : { background: "#2563eb", color: "#fff", border: "1px solid #1d4ed8" };
  return { ...base, borderRadius: 8, padding: "8px 12px", fontSize: 14, cursor: "pointer" };
}
const table = () => ({ width: "100%", borderCollapse: "separate", borderSpacing: 0 });
const th = (w) => ({ textAlign: "left", background: "#f8fafc", padding: "10px 12px", borderBottom: "1px solid #e5e7eb", width: w, whiteSpace: "nowrap", fontWeight: 700, fontSize: 13 });
const td = (w) => ({ padding: "8px 12px", borderBottom: "1px solid #f1f5f9", width: w, verticalAlign: "middle" });
const input = (w) => ({ width: w || "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14 });
const select = (w) => ({ width: w || "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 14, background: "#fff" });
const pill = () => ({ display: "inline-block", padding: "4px 10px", borderRadius: 999, background: "#111827", color: "#fff", fontSize: 13, lineHeight: 1.4 });

<Footer />