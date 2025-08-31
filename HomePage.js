import React from "react";
import { Link } from "react-router-dom";

export default function HomePage() {
    return (
        <div style={{ padding: 40, fontFamily: "Arial" }}>
            <h1>🏗️ Welcome to GenFab Tools</h1>
            <p>Click below to launch our first integrated tool:</p>
            <Link
                to="/tool"
                style={{
                    display: "inline-block",
                    padding: "10px 20px",
                    backgroundColor: "#4CAF50",
                    color: "white",
                    textDecoration: "none",
                    borderRadius: 5
                }}
            >
                🏢 Launch OccuCalc
            </Link>
        </div>
    );
}
