/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/app/**/*.{js,ts,jsx,tsx,mdx}'],
  safelist: [
    'pl-3', 'pr-3', 'px-4', 'px-3', 'mx-2', 'w-[200px]', 'min-w-[200px]',
    'w-[56px]', 'min-w-[56px]',
  ],
  theme: { extend: {} },
  plugins: [],
};