import { ImageResponse } from "next/og";
import { SOURCE_IDS } from "@/lib/ingest/sourceRegistry";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Timley — live tech internship & new grad tracker";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#000000",
          color: "#f5f5f7",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 110, fontWeight: 800, letterSpacing: "-0.03em" }}>
          timley<span style={{ color: "#0a84ff" }}>.</span>
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 34, color: "#98989d", lineHeight: 1.4 }}>
          US-focused internship &amp; new grad listings from {SOURCE_IDS.length} maintained sources — normalized and refreshed every 2 hours.
        </div>
        <div style={{ display: "flex", marginTop: 56, gap: 16 }}>
          {[
            ["Internships", "rgba(10,132,255,0.18)", "#64aeff"],
            ["New Grad", "rgba(48,209,88,0.15)", "#5ddd7f"],
            ["Save & track", "rgba(191,90,242,0.18)", "#d99bff"],
            ["Updated 2h", "rgba(255,159,10,0.15)", "#ffb340"],
          ].map(([label, bg, color]) => (
            <div
              key={label}
              style={{
                display: "flex",
                padding: "12px 28px",
                borderRadius: 999,
                background: bg,
                color,
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
