/**
 * Gera o ícone do MeuTreino — halter (dumbbell) estilizado.
 *
 * Rodar: node scripts/generate-icon.js
 * Gera: assets/images/icon.png (1024x1024) + public/icon-1024.png
 *        + assets/images/favicon.png (64x64) + public/favicon.ico (32x32)
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ACCENT = '#B4FF39';
const BG = '#0B0B0F';

// SVG 1024x1024 com gradientes sutis e halter centralizado.
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#1E1E27"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
    <linearGradient id="metalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#D9FF6A"/>
      <stop offset="50%" stop-color="${ACCENT}"/>
      <stop offset="100%" stop-color="#7FBF2A"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="14" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Fundo -->
  <rect width="1024" height="1024" fill="url(#bgGrad)"/>

  <!-- Halter (dumbbell) centralizado, na diagonal -->
  <g transform="translate(512 512) rotate(-45)" filter="url(#glow)">
    <!-- Barra central -->
    <rect x="-300" y="-22" width="600" height="44" rx="22" fill="url(#metalGrad)"/>

    <!-- Anilhas esquerdas (3 discos de fora pra dentro, crescentendo) -->
    <rect x="-360" y="-90" width="36" height="180" rx="10" fill="${ACCENT}"/>
    <rect x="-310" y="-72" width="22" height="144" rx="8" fill="${ACCENT}"/>

    <!-- Anilhas direitas (espelhado) -->
    <rect x="324" y="-90" width="36" height="180" rx="10" fill="${ACCENT}"/>
    <rect x="288" y="-72" width="22" height="144" rx="8" fill="${ACCENT}"/>

    <!-- Grips (textura) -->
    <rect x="-220" y="-12" width="180" height="24" rx="2" fill="#0B0B0F" opacity="0.35"/>
    <rect x="40" y="-12" width="180" height="24" rx="2" fill="#0B0B0F" opacity="0.35"/>
  </g>
</svg>
`;

// Favicon — versão简化, sem glow, pro tamanho pequeno ficar legível.
const faviconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="56" fill="${BG}"/>
  <g transform="translate(128 128) rotate(-45)">
    <rect x="-70" y="-6" width="140" height="12" rx="6" fill="${ACCENT}"/>
    <rect x="-86" y="-22" width="14" height="44" rx="3" fill="${ACCENT}"/>
    <rect x="72" y="-22" width="14" height="44" rx="3" fill="${ACCENT}"/>
  </g>
</svg>
`;

async function generate() {
  const outDir = path.resolve(__dirname, '..');
  const imagesDir = path.join(outDir, 'assets', 'images');
  const publicDir = path.join(outDir, 'public');

  // 1. Ícone principal 1024x1024
  await sharp(Buffer.from(iconSvg))
    .png()
    .toFile(path.join(imagesDir, 'icon.png'));
  console.log('✓ assets/images/icon.png (1024x1024)');

  // Cópia pra public (PWA)
  await sharp(Buffer.from(iconSvg))
    .png()
    .toFile(path.join(publicDir, 'icon-1024.png'));
  console.log('✓ public/icon-1024.png (1024x1024)');

  // 2. Versões menores pra PWA (Android/Windows usam 192 e 512)
  await sharp(Buffer.from(iconSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('✓ public/icon-512.png (512x512)');

  await sharp(Buffer.from(iconSvg))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('✓ public/icon-192.png (192x192)');

  // 3. Favicon PNG (256x256 — browsers redimensionam)
  await sharp(Buffer.from(faviconSvg))
    .resize(256, 256)
    .png()
    .toFile(path.join(imagesDir, 'favicon.png'));
  console.log('✓ assets/images/favicon.png (256x256)');

  await sharp(Buffer.from(faviconSvg))
    .resize(256, 256)
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));
  console.log('✓ public/favicon.png (256x256)');

  // 4. apple-touch-icon (180x180) — iOS usa pra ícone da tela inicial
  await sharp(Buffer.from(iconSvg))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('✓ public/apple-touch-icon.png (180x180)');

  // 5. android-icon-foreground (adaptativo Android) — só halter, fundo transparente
  const adaptiveSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432">
      <g transform="translate(216 216) rotate(-45)">
        <rect x="-130" y="-9" width="260" height="18" rx="9" fill="${ACCENT}"/>
        <rect x="-156" y="-36" width="22" height="72" rx="5" fill="${ACCENT}"/>
        <rect x="134" y="-36" width="22" height="72" rx="5" fill="${ACCENT}"/>
      </g>
    </svg>`;
  await sharp(Buffer.from(adaptiveSvg))
    .png()
    .toFile(path.join(imagesDir, 'android-icon-foreground.png'));
  console.log('✓ assets/images/android-icon-foreground.png');

  console.log('\nÍcones gerados! 🎨');
}

generate().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
