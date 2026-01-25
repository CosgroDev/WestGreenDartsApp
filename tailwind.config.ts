import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
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
        }
      }
    }
  },
  plugins: []
};

export default config;
