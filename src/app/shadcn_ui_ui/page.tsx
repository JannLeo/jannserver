import NavBar from '@/components/NavBar';

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <NavBar />
      
      <main className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <section className="text-center mb-20">
          <h1 className="text-5xl font-extrabold tracking-tight mb-6">
            Beautifully designed components.
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-8">
            A set of beautifully designed components that you can customize, extend, and build on. 
            Start here then make it your own. Open Source. Open Code.
          </p>
          <div className="flex justify-center gap-4">
            <button className="px-6 py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors">
              Get Started 🚀
            </button>
            <button className="px-6 py-3 border border-slate-200 text-slate-900 rounded-lg font-medium hover:bg-slate-50 transition-colors">
              View on GitHub 🐙
            </button>
          </div>
        </section>

        {/* Features Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <div className="p-6 border border-slate-200 rounded-xl hover:shadow-lg transition-shadow">
            <div className="text-4xl mb-4">🎨</div>
            <h3 className="text-xl font-bold mb-2">Customizable</h3>
            <p className="text-slate-600">
              Built on top of Tailwind CSS. Change the look and feel of your entire app with a single variable.
            </p>
          </div>
          <div className="p-6 border border-slate-200 rounded-xl hover:shadow-lg transition-shadow">
            <div className="text-4xl mb-4">📦</div>
            <h3 className="text-xl font-bold mb-2">Open Source</h3>
            <p className="text-slate-600">
              Licensed under MIT. Use these components in your personal or commercial projects.
            </p>
          </div>
          <div className="p-6 border border-slate-200 rounded-xl hover:shadow-lg transition-shadow">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-xl font-bold mb-2">Accessible</h3>
            <p className="text-slate-600">
              Built with accessibility in mind. Follows WAI-ARIA standards and best practices.
            </p>
          </div>
        </section>

        {/* Documentation Link */}
        <section className="text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to build?</h2>
          <p className="text-slate-600 mb-8">
            Visit the documentation to learn how to use shadcn/ui in your project.
          </p>
          <a 
            href="https://ui.shadcn.com/docs" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-slate-900 font-semibold hover:underline"
          >
            Read the Documentation 📖
          </a>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8 mt-20">
        <div className="container mx-auto px-4 text-center text-slate-500">
          <p>Licensed under the MIT License.</p>
        </div>
      </footer>
    </div>
  );
}