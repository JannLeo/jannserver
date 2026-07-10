'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { documents, categories, sources, PromptDoc } from '@/lib/system-prompts';

function SystemPromptsContent() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSource, setSelectedSource] = useState('All');
  const [selectedDoc, setSelectedDoc] = useState<PromptDoc | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const docId = searchParams.get('doc');
    if (docId) {
      const doc = documents.find(d => d.id === parseInt(docId));
      if (doc) setSelectedDoc(doc);
    }
  }, [searchParams]);

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || doc.category === selectedCategory;
    const matchesSource = selectedSource === 'All' || doc.source === selectedSource;
    return matchesSearch && matchesCategory && matchesSource;
  });

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Official': 'bg-blue-100 text-blue-800',
      'Claude Code': 'bg-purple-100 text-purple-800',
      'Desktop': 'bg-green-100 text-green-800',
      'Mobile': 'bg-orange-100 text-orange-800',
      'Browser': 'bg-indigo-100 text-indigo-800',
      'Integration': 'bg-teal-100 text-teal-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  const getSourceColor = (source: string) => {
    const colors: Record<string, string> = {
      'Anthropic': 'bg-yellow-100 text-yellow-800',
    };
    return colors[source] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">System Prompts</h1>
            <p className="mt-2 text-gray-600">
              Browse, search, and view leaked AI system prompts from the{' '}
              <a
                href="https://github.com/asgeirtj/system_prompts_leaks"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                system_prompts_leaks
              </a>{' '}
              repository.
            </p>
          </div>
          <div className="text-sm text-gray-500">
            {documents.length} documents total
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                type="text"
                id="search"
                placeholder="Search by title or description..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Category filter */}
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                id="category"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Source filter */}
            <div>
              <label htmlFor="source" className="block text-sm font-medium text-gray-700 mb-1">
                Source
              </label>
              <select
                id="source"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
              >
                {sources.map(src => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Document list */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map(doc => (
            <div
              key={doc.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedDoc(doc)}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-900 truncate">{doc.title}</h3>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(doc.category)}`}>
                  {doc.category}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">{doc.description}</p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSourceColor(doc.source)}`}>
                  {doc.source}
                </span>
                <span>{doc.date}</span>
              </div>
            </div>
          ))}
          {filteredDocs.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              No documents match your filters.
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setSelectedDoc(null)}></div>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <div className="flex justify-between items-start">
                      <h3 className="text-2xl leading-6 font-semibold text-gray-900" id="modal-title">
                        {selectedDoc.title}
                      </h3>
                      <button
                        type="button"
                        className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        onClick={() => setSelectedDoc(null)}
                      >
                        <span className="sr-only">Close</span>
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(selectedDoc.category)}`}>
                          {selectedDoc.category}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSourceColor(selectedDoc.source)}`}>
                          {selectedDoc.source}
                        </span>
                        <span className="text-xs text-gray-500">{selectedDoc.date}</span>
                      </div>
                      <p className="text-sm text-gray-600">{selectedDoc.description}</p>
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">System Prompt Content</h4>
                        <pre className="bg-gray-100 rounded-md p-4 text-sm text-gray-800 overflow-auto max-h-96 whitespace-pre-wrap border border-gray-200">
                          {selectedDoc.content}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => setSelectedDoc(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SystemPromptsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading system prompts...</div>
      </div>
    }>
      <SystemPromptsContent />
    </Suspense>
  );
}