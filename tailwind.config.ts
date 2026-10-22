import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: { colors: { canvas:'#f6f8fc', brand: { 50:'#eef2ff', 100:'#e0e7ff', 200:'#c7d2fe', 600:'#4f46e5', 700:'#4f46e5', 800:'#4338ca', 900:'#3730a3' } }, boxShadow: { soft:'0 12px 35px rgba(15,23,42,.06)' } } },
  plugins: []
};
export default config;
