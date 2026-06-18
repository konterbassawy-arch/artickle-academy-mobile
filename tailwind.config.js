/** @type {import('tailwindcss').Config} */
// Ported from the inline `tailwind.config` block that used to live in index.html (the CDN
// JIT compiler). The `content` globs let the build step scan every source file for class
// names, replacing the CDN's runtime scanning.
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          850: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        primary: {
          500: '#3b82f6',
          600: '#2563eb',
        },
      },
    },
  },
  plugins: [],
};
