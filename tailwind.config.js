module.exports = {
  content: ["./index.html", "./app.js"],
  theme: {
    extend: {
      colors: {
        "surface-dim": "#F3F4F6", "surface-container-low": "#FFFFFF",
        "surface-container": "#F9FAF5", "surface-container-high": "#E5E7EB",
        "surface-container-highest": "#D1D5DB", "surface-container-lowest": "#F9FAF5",
        primary: "#7C3AED", "on-primary": "#ffffff", secondary: "#0EA5E9",
        "accent-2": "#D97706", "accent-3": "#EC4899", outline: "rgba(0,0,0,.08)",
        background: "#F3F4F6", "on-surface": "#1F2937", "on-surface-variant": "#4B5563",
      },
      spacing: { "panel-width": "340px", base: "8px", "margin-desktop": "32px", gutter: "20px" },
      fontFamily: { title: ["Space Grotesk", "sans-serif"], body: ["Inter", "sans-serif"], mono: ["Space Mono", "monospace"] },
    },
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/container-queries")],
};
