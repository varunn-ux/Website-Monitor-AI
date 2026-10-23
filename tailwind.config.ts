import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f6f8fc',
        brand: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 600: '#4f46e5', 700: '#4f46e5', 800: '#4338ca', 900: '#3730a3' },
        cyan: { 50: '#ecfeff', 100: '#cffafe', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490' },
        violet: { 50: '#f5f3ff', 100: '#ede9fe', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
      },
      fontFamily: {
        heading: ['var(--font-space-grotesk)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        soft: '0 12px 35px rgba(15,23,42,.06)',
        glass: '0 18px 48px rgba(35,47,84,.08), inset 0 1px 0 rgba(255,255,255,.8)',
      },
      backgroundImage: {
        'dashboard-mesh': 'radial-gradient(ellipse at 12% 2%, rgba(99,102,241,.11), transparent 34%), radial-gradient(ellipse at 92% 14%, rgba(6,182,212,.08), transparent 31%), linear-gradient(180deg, #f9faff 0%, #f6f8fc 54%, #f7f9fd 100%)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'soft-pulse': { '0%, 100%': { opacity: '.72', transform: 'scale(.96)' }, '50%': { opacity: '1', transform: 'scale(1)' } },
        'ring-draw': { from: { strokeDashoffset: '238.76' } },
      },
      animation: {
        'fade-up': 'fade-up .45s ease-out both',
        'soft-pulse': 'soft-pulse 2.2s ease-in-out infinite',
        'ring-draw': 'ring-draw .9s ease-out both',
      },
    },
  },
  plugins: []
};
export default config;
