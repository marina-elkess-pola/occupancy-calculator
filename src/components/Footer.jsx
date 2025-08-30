import React from "react";
import pkg from "../../package.json";

export default function Footer() {
    const built = new Date().toLocaleString();
    return (
        <footer style={{ marginTop: 40, fontSize: 12, color: "#666", textAlign: "center" }}>
            GenFab Tools · v{pkg.version} · Built: {built}
        </footer>
    );
}
