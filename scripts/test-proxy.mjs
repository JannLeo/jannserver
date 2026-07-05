// Test script to verify undici ProxyAgent works
import('undici').then(async (undici) => {
  const { setGlobalDispatcher, ProxyAgent } = undici;

  // Set global dispatcher
  setGlobalDispatcher(new ProxyAgent({ uri: 'http://127.0.0.1:7890' }));
  console.log('[test] Global dispatcher set');

  try {
    // Test fetch through proxy
    const res = await fetch('https://openlibrary.org/search.json?q=hongloumeng&limit=2');
    console.log('[test] Status:', res.status);
    const data = await res.json();
    console.log('[test] Docs:', data.docs?.length, '| first:', data.docs?.[0]?.title);
  } catch (e) {
    console.error('[test] Fetch failed:', e.message);
  }
});