import type { Config } from "tailwindcss";

// Legacy numeric utilities resolve through the active semantic theme. Opacity
// modifiers remain supported by Tailwind's <alpha-value> substitution.
const themedScale = (name: string) => Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(step =>
    [step, `rgb(var(--${name}-${step}) / <alpha-value>)`])
);

const config: Config = {
  content: ["./src/app/**/*.{js,ts,jsx,tsx}", "./src/components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: themedScale("slate"), emerald: themedScale("emerald"),
        red: themedScale("red"), amber: themedScale("amber"),
        purple: themedScale("purple"), blue: themedScale("blue"),
        brand: { 50: "#f2fbf7", 100: "#d6f6e7", 200: "#aee8cf", 300: "#7fd2b1", 400: "#4fb18d", 500: "#2f8f6d", 600: "#227256", 700: "#1c5a46", 800: "#18483a", 900: "#133b30" },
        gold: { 300: "rgb(var(--gold-rgb) / <alpha-value>)", 400: "rgb(var(--gold-rgb) / <alpha-value>)", 500: "#a86b00" },
        surface: { DEFAULT: "rgb(var(--surface-rgb) / <alpha-value>)", raised: "rgb(var(--surface-raised-rgb) / <alpha-value>)", deep: "rgb(var(--bg-rgb) / <alpha-value>)" }
      }
    }
  },
  plugins: []
};
export default config;
