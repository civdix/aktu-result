import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#050814" />
      <stop offset="50%" stop-color="#0a1026" />
      <stop offset="100%" stop-color="#020308" />
    </linearGradient>
    <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="50%" stop-color="#60a5fa" />
      <stop offset="100%" stop-color="#a855f7" />
    </linearGradient>
    <radialGradient id="glow1" cx="20%" cy="20%" r="50%">
      <stop offset="0%" stop-color="#2563eb" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#050814" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glow2" cx="80%" cy="80%" r="50%">
      <stop offset="0%" stop-color="#9333ea" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#050814" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect width="1200" height="630" fill="url(#glow1)" />
  <rect width="1200" height="630" fill="url(#glow2)" />

  <!-- Border Frame -->
  <rect x="24" y="24" width="1152" height="582" rx="24" fill="none" stroke="#2563eb" stroke-opacity="0.25" stroke-width="2" />

  <!-- Badge -->
  <g transform="translate(80, 80)">
    <rect width="360" height="42" rx="21" fill="#2563eb" fill-opacity="0.15" stroke="#3b82f6" stroke-opacity="0.4" stroke-width="1.5" />
    <circle cx="24" cy="21" r="6" fill="#3b82f6" />
    <text x="42" y="26" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#60a5fa" letter-spacing="1.5">AKTU STUDENT PORTAL 2024–2025</text>
  </g>

  <!-- Title -->
  <text x="80" y="220" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="900" fill="#ffffff" letter-spacing="-1">
    AKTU Result &amp; OneView
  </text>
  <text x="80" y="295" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="54" font-weight="900" fill="url(#textGrad)" letter-spacing="-0.5">
    ERP Result &amp; Marksheet Portal
  </text>

  <!-- Subtitle -->
  <text x="80" y="370" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="500" fill="#94a3b8">
    Instant SGPA, CGPA &amp; Semester Scorecard Lookup by University Roll Number
  </text>
  <text x="80" y="408" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="500" fill="#64748b">
    Direct Server-Side Access • Without Date of Birth Barrier • High-Speed Query
  </text>

  <!-- Pills / Feature tags -->
  <g transform="translate(80, 480)">
    <!-- Pill 1 -->
    <rect x="0" y="0" width="220" height="54" rx="14" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1" />
    <text x="30" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600" fill="#e2e8f0">⚡ AKTU Result 2025</text>

    <!-- Pill 2 -->
    <rect x="240" y="0" width="220" height="54" rx="14" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1" />
    <text x="270" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600" fill="#e2e8f0">📋 OneView AKTU</text>

    <!-- Pill 3 -->
    <rect x="480" y="0" width="220" height="54" rx="14" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1" />
    <text x="510" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600" fill="#e2e8f0">🏢 AKTU ERP Result</text>

    <!-- Pill 4 -->
    <rect x="720" y="0" width="240" height="54" rx="14" fill="#22c55e" fill-opacity="0.1" stroke="#22c55e" stroke-opacity="0.3" stroke-width="1" />
    <text x="745" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700" fill="#4ade80">✓ 100% Free &amp; Secure</text>
  </g>
</svg>
`;

async function run() {
  const outputPath = path.resolve(process.cwd(), 'public', 'og-image.png');
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);
  console.log('og-image.png generated successfully at:', outputPath);
}

run().catch(console.error);
