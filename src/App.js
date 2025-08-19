import React, { useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";

const OCCUPANCY_OPTIONS = ["Retail", "Restaurant", "Administrative", "Mechanical"];

const OCCUPANCY_FACTORS = {
  Retail: 2.8,
  Restaurant: 1.4,
  Administrative: 9.3,
  Mechanical: 28,
};

function App() {
  const [mode, setMode] = useState("manual");
  const [manualSpaces, setManualSpaces] = useState([{ area: "", occupancyType: "Retail" }]);
  const [excelData, setExcelData] = useState([]);
  const [totals, setTotals] = useState({});
  const [grandTotal, setGrandTotal] = useState(0);

  const handleModeChange = (e) => {
    setMode(e.target.value);
    setExcelData([]);
    setTotals({});
    setGrandTotal(0);
  };

  const recalculateOccupants = (rows) => {
    let total = 0;
    const grouped = {};

    const updated = rows.map((row) => {
      const area = parseFloat(row["Area (m²)"]);
      let type = row["Occupancy Type"]?.trim();
      if (!type || !OCCUPANCY_FACTORS[type]) {
        type = "Retail";
        row["Occupancy Type"] = "Retail";
      }
      const factor = OCCUPANCY_FACTORS[type] || 1;

      const load = isNaN(area) ? 0 : Math.ceil(area / factor);
      if (!grouped[type]) grouped[type] = 0;
      grouped[type] += load;
      total += load;

      return {
        ...row,
        "Occupant Load": load,
      };
    });

    setExcelData(updated);
    setTotals(grouped);
    setGrandTotal(total);
  };

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target.result, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      recalculateOccupants(data);
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Occupancy Summary", 10, 20);

    let y = 40;
    Object.entries(totals).forEach(([type, count]) => {
      doc.text(`${type}: ${count} occupants`, 10, y);
      y += 10;
    });

    doc.text(`Grand Total: ${grandTotal} occupants`, 10, y + 10);
    doc.save("occupancy_summary.pdf");
  };

  const handleExportManualPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Manual Entry - Occupancy Report", 10, 20);
    let y = 40;
    manualSpaces.forEach((space, i) => {
      const area = parseFloat(space.area);
      const factor = OCCUPANCY_FACTORS[space.occupancyType];
      const occupants = isNaN(area) ? 0 : Math.ceil(area / factor);
      doc.text(`Space ${i + 1}: ${area} m², ${space.occupancyType} → ${occupants} occupants`, 10, y);
      y += 10;
    });
    doc.save("manual_occupancy_report.pdf");
  };

  const handleExportManual = () => {
    const rows = manualSpaces.map((space, i) => {
      const area = parseFloat(space.area);
      const factor = OCCUPANCY_FACTORS[space.occupancyType];
      const occupants = isNaN(area) ? 0 : Math.ceil(area / factor);

      return {
        "Space #": i + 1,
        "Area (m²)": area,
        "Occupancy Type": space.occupancyType,
        "Occupant Load": occupants,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Manual Data");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    saveAs(new Blob([buffer], { type: "application/octet-stream" }), "manual_occupancy.xlsx");
  };

  const handleExportUploadedExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Uploaded Data");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    saveAs(new Blob([buffer], { type: "application/octet-stream" }), "uploaded_occupancy.xlsx");
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>🏢 Occupancy Calculator</h1>

      <div style={{ marginBottom: "20px" }}>
        <label>
          <input type="radio" value="manual" checked={mode === "manual"} onChange={handleModeChange} />
          Manual Entry
        </label>{" "}
        |{" "}
        <label>
          <input type="radio" value="excel" checked={mode === "excel"} onChange={handleModeChange} />
          Upload Excel
        </label>
      </div>

      {mode === "manual" && (
        <>
          {manualSpaces.map((space, index) => (
            <div key={index} style={{ marginBottom: "10px" }}>
              <input
                type="number"
                placeholder="Area (m²)"
                value={space.area}
                onChange={(e) => {
                  const updated = [...manualSpaces];
                  updated[index].area = e.target.value;
                  setManualSpaces(updated);
                }}
              />
              <select
                value={space.occupancyType}
                onChange={(e) => {
                  const updated = [...manualSpaces];
                  updated[index].occupancyType = e.target.value;
                  setManualSpaces(updated);
                }}
              >
                {[...OCCUPANCY_OPTIONS].sort().map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <button onClick={() => setManualSpaces(manualSpaces.filter((_, i) => i !== index))}>🗑</button>
            </div>
          ))}
          <button onClick={() => setManualSpaces([...manualSpaces, { area: "", occupancyType: "Retail" }])}>➕ Add Space</button>
          <br />
          <button onClick={handleExportManual} style={{ marginTop: "10px" }}>
            📊 Export Manual to Excel
          </button>
          <br />
          <button
            style={{ marginTop: "10px" }}
            disabled={manualSpaces.length === 0}
            onClick={() => {
              const converted = manualSpaces.map((s) => ({
                "Area (m²)": s.area,
                "Occupancy Type": s.occupancyType
              }));
              recalculateOccupants(converted);
            }}
          >
            ✅ Calculate
          </button>
          <br />
          <button
            style={{ marginTop: "10px" }}
            onClick={handleExportManualPDF}
          >
            📥 Export Manual PDF
          </button>
          {grandTotal > 0 && (
            <div style={{ marginTop: "20px" }}>
              <h3>🔢 Totals</h3>
              <ul>
                {Object.entries(totals).map(([type, count]) => (
                  <li key={type}>
                    {type}: {count} occupants
                  </li>
                ))}
              </ul>
              <strong>Grand Total: {grandTotal} occupants</strong>
            </div>
          )}
        </>
      )}

      {mode === "excel" && (
        <>
          <input type="file" accept=".xlsx" onChange={handleUpload} />
          {excelData.length > 0 && (
            <>
              <table border="1" cellPadding="5" style={{ marginTop: "20px", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {Object.keys(excelData[0]).map((key) => (
                      <th key={key}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {excelData.map((row, i) => (
                    <tr key={i}>
                      <td>{row["Room Number"]}</td>
                      <td>{row["Room Name"]}</td>
                      <td>
                        <input
                          type="number"
                          value={row["Area (m²)"]}
                          onChange={(e) => {
                            const newData = [...excelData];
                            newData[i]["Area (m²)"] = e.target.value;
                            recalculateOccupants(newData);
                          }}
                        />
                      </td>
                      <td>
                        <select
                          value={row["Occupancy Type"]}
                          onChange={(e) => {
                            const newData = [...excelData];
                            newData[i]["Occupancy Type"] = e.target.value;
                            recalculateOccupants(newData);
                          }}
                        >
                          {OCCUPANCY_OPTIONS.map((opt) => (
                            <option key={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>
                      <td>{row["Occupant Load"]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 style={{ marginTop: "20px" }}>🔢 Totals</h3>
              <ul>
                {Object.entries(totals).map(([type, count]) => (
                  <li key={type}>
                    {type}: {count} occupants
                  </li>
                ))}
              </ul>
              <p><strong>Grand Total: {grandTotal} occupants</strong></p>
              <button onClick={handleExportPDF} style={{ marginRight: "10px" }}>📥 Export Summary PDF</button>
              <button onClick={handleExportUploadedExcel}>📊 Export Excel</button>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;
