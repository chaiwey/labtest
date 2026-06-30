import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        accent: {
          green: "#10b981", // emerald-500
          blue: "#3b82f6", // blue-500
          purple: "#8b5cf6", // violet-500
        },
      },
      boxShadow: {
        soft: "0 1px 3px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
