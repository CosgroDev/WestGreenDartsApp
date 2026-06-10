import type { Config } from "tailwindcss";

/**
 * Dark "match night" theme.
 *
 * The slate/emerald/red/amber/purple/blue scales are intentionally inverted
 * versus Tailwind defaults: existing markup written for a light theme
 * (e.g. `bg-slate-50` tints, `text-slate-700` body copy, `border-slate-200`
 * hairlines) renders correctly on dark surfaces without per-page rewrites.
 * Low numbers = dark tinted surfaces, high numbers = light text tints.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          50: "#131f33",
          100: "#1a2a44",
          200: "#243756",
          300: "#33476b",
          400: "#8294b5",
          500: "#93a5c4",
          600: "#a9bad6",
          700: "#c6d3e8",
          800: "#e2eaf6",
          900: "#f4f7fc"
        },
        emerald: {
          50: "#0b2e22",
          100: "#0e3d2c",
          200: "#175c42",
          300: "#1e7a57",
          400: "#27a173",
          500: "#2fc08a",
          600: "#0ca678",
          700: "#12b886",
          800: "#63e6be",
          900: "#96f2d7"
        },
        red: {
          50: "#381622",
          100: "#471a2b",
          200: "#67263c",
          300: "#933349",
          400: "#e0566d",
          500: "#f06a7e",
          600: "#fa5252",
          700: "#ff8787",
          800: "#ffa8a8",
          900: "#ffc9c9"
        },
        amber: {
          50: "#3a2a0c",
          100: "#4a350f",
          200: "#6b4d14",
          300: "#94691a",
          400: "#d9a52b",
          500: "#f59e0b",
          600: "#e8930c",
          700: "#ffd43b",
          800: "#ffe066",
          900: "#fff3bf"
        },
        purple: {
          50: "#2c1e44",
          100: "#382557",
          200: "#4f3573",
          300: "#6a4a99",
          400: "#8a63d2",
          500: "#9775fa",
          600: "#a685fa",
          700: "#b197fc",
          800: "#cdb8ff",
          900: "#e5dbff"
        },
        blue: {
          50: "#142a4d",
          100: "#173361",
          200: "#1f4587",
          300: "#2a5cb8",
          400: "#5c93f7",
          500: "#74a5fa",
          600: "#7aa7f8",
          700: "#9bc0ff",
          800: "#bcd5ff",
          900: "#d9e7ff"
        },
        brand: {
          50: "#f2fbf7",
          100: "#d6f6e7",
          200: "#aee8cf",
          300: "#7fd2b1",
          400: "#4fb18d",
          500: "#2f8f6d",
          600: "#227256",
          700: "#1c5a46",
          800: "#18483a",
          900: "#133b30"
        },
        gold: {
          300: "#ffe066",
          400: "#ffd43b",
          500: "#fab005"
        },
        surface: {
          DEFAULT: "#0e1a2e",
          raised: "#13223b",
          deep: "#070d18"
        }
      }
    }
  },
  plugins: []
};

export default config;
