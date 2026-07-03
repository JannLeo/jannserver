// DB cleanup script - runs in Next.js server context where db module is already loaded
// Usage: Run via: node --import ./src/lib/setup.ts scripts/cleanup-db.ts
// But simpler: create as a route or use existing delete/create endpoints

// This script will be executed as an API handler instead
// We'll create a temporary cleanup endpoint
console.log('Creating cleanup script...');