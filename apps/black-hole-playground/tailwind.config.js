/** @type {import('tailwindcss').Config} */
// Tailwind is only used by the imported Gemini Neon version (src/gemini). The main app and the
// compare page use plain CSS, so utilities are generated from that folder alone. It runs through
// the Tailwind CLI (npm run build:gemini-css), not through Vite's PostCSS.
export default {
  content: ['./gemini.html', './src/gemini/**/*.{js,ts,jsx,tsx}'],
  // Gemini's toggle switches use `translate-x-4.5`, which is not in Tailwind's default spacing scale
  // (so the knob never moved). 1.125rem is the offset that lands it at the end of its w-9 track.
  theme: { extend: { spacing: { 4.5: '1.125rem' } } },
  plugins: [],
};
