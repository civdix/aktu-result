import dotenv from 'dotenv';
dotenv.config();

// Ensure Astro and all services bind to 0.0.0.0 and process.env.PORT (defaults to 10000 on Render)
process.env.HOST = process.env.HOST || '0.0.0.0';
process.env.PORT = process.env.PORT || '10000';
process.env.EMBEDDED_MODE = 'true';

console.log('====================================================');
console.log('🚀 [Unified Server] Starting AKTU Full Stack Service');
console.log(`🌐 [Unified Server] Host: ${process.env.HOST} | Port: ${process.env.PORT}`);
console.log('====================================================');

// 1. Launch Telegram Bot in the background
console.log('🤖 [Unified Server] Launching Telegram Bot listener...');
import('./bot/telegram.js')
  .then(() => {
    console.log('✅ [Unified Server] Telegram Bot initialized successfully.');
  })
  .catch((err) => {
    console.error('❌ [Unified Server] Error initializing Telegram Bot:', err.message);
  });

// 2. Launch Astro Node.js Web Server (serves all frontend pages and API routes)
console.log('🌐 [Unified Server] Launching Astro Web Server & APIs...');
import('../dist/server/entry.mjs')
  .then(() => {
    console.log(`✅ [Unified Server] Astro Web Server is LIVE on http://${process.env.HOST}:${process.env.PORT}`);
  })
  .catch((err) => {
    console.error('❌ [Unified Server] Error starting Astro Web Server:', err.message);
  });
