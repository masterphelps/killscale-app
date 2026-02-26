import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORTRAIT = process.argv.includes('--portrait');
const DURATION_SEC = 30;
const FPS = 60;
const WIDTH = PORTRAIT ? 1080 : 1920;
const HEIGHT = PORTRAIT ? 1920 : 1080;
const OUTPUT = path.join(__dirname, '..', 'public', PORTRAIT ? 'feature-cards-loop-portrait.mp4' : 'feature-cards-loop.mp4');

console.log(`Mode: ${PORTRAIT ? '9:16 portrait' : '16:9 landscape'} (${WIDTH}x${HEIGHT})`);

const TOTAL_FRAMES = DURATION_SEC * FPS; // 1800
const DELTA_MS = 1000 / FPS;            // 16.667ms per frame

// Serve the capture HTML locally
const htmlPath = path.join(__dirname, 'capture-feature-cards.html');
const html = readFileSync(htmlPath, 'utf-8');

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;
console.log(`Serving capture page on port ${port}`);

// Launch headless browser
const browser = await puppeteer.launch({
  headless: true,
  args: [
    `--window-size=${WIDTH},${HEIGHT}`,
    '--no-sandbox',
    '--disable-gpu',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

// Set capture mode before page loads
await page.evaluateOnNewDocument(() => { window.__captureMode = true; });
await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle0' });

// Override dimensions for portrait mode
if (PORTRAIT) {
  await page.addStyleTag({ content: `
    body { width: 1080px !important; height: 1920px !important; }
    .canvas { width: 1080px !important; height: 1920px !important; }
    .fc-carousel::before, .fc-carousel::after { width: 100px; }
  `});
}

// Wait for fonts
await page.waitForFunction(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 500));

console.log(`Rendering ${TOTAL_FRAMES} frames at ${FPS}fps (${DURATION_SEC}s)...`);
const startTime = Date.now();

// Spawn ffmpeg - accept raw PNG frames via stdin
const ffmpeg = spawn('ffmpeg', [
  '-y',
  '-f', 'image2pipe',
  '-framerate', String(FPS),
  '-i', '-',
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '17',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  OUTPUT,
], { stdio: ['pipe', 'inherit', 'inherit'] });

// Frame-by-frame deterministic render
for (let i = 0; i < TOTAL_FRAMES; i++) {
  // Advance animation by exactly one frame's worth
  await page.evaluate((dt) => window.__advanceFrame(dt), DELTA_MS);

  // Capture frame
  const buf = await page.screenshot({ type: 'png' });
  const ok = ffmpeg.stdin.write(buf);

  // Backpressure: wait for ffmpeg to drain if needed
  if (!ok) await new Promise(r => ffmpeg.stdin.once('drain', r));

  // Progress every 2 seconds of video
  if (i % (FPS * 2) === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const pct = Math.round(i / TOTAL_FRAMES * 100);
    console.log(`  ${pct}% — frame ${i}/${TOTAL_FRAMES} (${elapsed}s elapsed)`);
  }
}

ffmpeg.stdin.end();
await new Promise(resolve => ffmpeg.on('close', resolve));

const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
await browser.close();
server.close();

console.log(`\nDone in ${totalElapsed}s!`);
console.log(`Video: ${OUTPUT}`);
console.log(`Size: ${(readFileSync(OUTPUT).length / 1024 / 1024).toFixed(1)} MB`);
