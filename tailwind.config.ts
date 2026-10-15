import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: { colors: { brand: { 50:'#fff1f1', 100:'#fde3e3', 600:'#a80000', 700:'#8f0000', 800:'#700000' } }, boxShadow: { soft:'0 12px 35px rgba(15,23,42,.06)' } } },
  plugins: []
};
export default config;
