/** @type {import("tailwindcss").Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        surface2: v("surface2"),
        line: v("line"),
        ink: v("ink"),
        muted: v("muted"),
        faint: v("faint"),
        rail: v("rail"),
        ok: v("ok"),
        warn: v("warn"),
        bad: v("bad"),
        info: v("info"),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        display: ['"Barlow Condensed"', "Impact", "sans-serif"],
      },
      boxShadow: {
        lift: "0 1px 0 rgb(var(--line) / 0.6), 0 8px 24px -12px rgb(var(--ink) / 0.18)",
      },
    },
  },
  plugins: [],
};
