/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'pl-3', 'pr-3', 'px-4', 'px-3', 'mx-2', 'w-[200px]', 'min-w-[200px]',
    'w-[56px]', 'min-w-[56px]',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#1b2430',
        parchment: '#f5f0e8',
        evergreen: '#173f3c',
      },
      boxShadow: {
        soft: '0 24px 70px rgba(39, 32, 24, 0.10)',
      },
    },
  },
  plugins: [],
};
