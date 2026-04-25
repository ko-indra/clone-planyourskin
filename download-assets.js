const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const ORIGIN = 'https://planyourskin.com';
const PUBLIC_DIR = path.join(__dirname, 'public');
const PYS_REGEX = /(https?:)?\/\/(www\.)?planyourskin\.com/g;

const downloadedAssets = new Set();
const queue = new Set();

// Function to add a URL to the download queue
function enqueueAsset(url) {
  if (!url || url.startsWith('data:') || url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('javascript:')) return;

  // Remove query params for local saving
  let cleanUrl = url.split('?')[0];

  // Only enqueue asset-like paths
  if (!cleanUrl.startsWith('/wp-content/') && !cleanUrl.startsWith('/wp-includes/')
    && !cleanUrl.endsWith('.js') && !cleanUrl.endsWith('.css')
    && !cleanUrl.match(/\.(png|jpe?g|gif|webp|svg|woff2?|ttf|eot|ico)$/i)) {
    return;
  }

  if (!downloadedAssets.has(cleanUrl) && !queue.has(cleanUrl)) {
    queue.add(cleanUrl);
  }
}

// Extract assets from HTML
function scanHtml(htmlPath) {
  const content = fs.readFileSync(htmlPath, 'utf8');

  // Match src="...", href="...", data-src="...", data-lazy-src="..."
  const regex = /(?:src|href|data-src|data-lazy-src)=["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    let url = match[1];
    url = url.replace(PYS_REGEX, '');
    if (url.startsWith('/')) enqueueAsset(url);
  }

  // Match srcset="..." and data-srcset="..."
  const srcsetRegex = /(?:data-)?srcset=["']([^"']+)["']/g;
  while ((match = srcsetRegex.exec(content)) !== null) {
    const urls = match[1].split(',').map(s => s.trim().split(' ')[0]);
    urls.forEach(url => {
      url = url.replace(PYS_REGEX, '');
      if (url.startsWith('/')) enqueueAsset(url);
    });
  }

  // Match url(...) in inline styles
  const urlRegex = /url\(["']?([^"')\s]+)["']?\)/g;
  while ((match = urlRegex.exec(content)) !== null) {
    let url = match[1];
    if (url.startsWith('data:')) continue;
    url = url.replace(PYS_REGEX, '');
    if (url.startsWith('/')) enqueueAsset(url);
  }
}

// Extract assets from CSS
function scanCss(cssPath) {
  if (!fs.existsSync(cssPath)) return;
  const content = fs.readFileSync(cssPath, 'utf8');
  const regex = /url\(["']?([^"')\s]+)["']?\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    let url = match[1];
    if (url.startsWith('data:')) continue;

    url = url.replace(PYS_REGEX, '');

    if (!url.startsWith('/')) {
      // Resolve relative path
      const cssDir = path.dirname(cssPath.replace(PUBLIC_DIR, '').replace(/\\/g, '/'));
      url = path.posix.resolve(cssDir, url);
    }
    enqueueAsset(url);
  }
}

async function downloadFile(url) {
  const saveUrl = url.split('?')[0];
  const savePath = path.join(PUBLIC_DIR, saveUrl);

  // Skip if already exists locally
  if (fs.existsSync(savePath)) {
    return savePath;
  }

  try {
    console.log(`  ↓ ${url}`);
    const res = await fetch(ORIGIN + url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) {
      console.error(`    ⚠ Failed: ${res.status} ${res.statusText}`);
      return false;
    }

    fs.mkdirSync(path.dirname(savePath), { recursive: true });

    const buffer = await res.buffer();
    fs.writeFileSync(savePath, buffer);

    // If it's a CSS file, rewrite planyourskin.com URLs inside it
    if (saveUrl.endsWith('.css')) {
      let cssContent = fs.readFileSync(savePath, 'utf8');
      if (cssContent.includes('planyourskin.com')) {
        cssContent = cssContent.replace(PYS_REGEX, '');
        fs.writeFileSync(savePath, cssContent);
      }
    }

    return savePath;
  } catch (e) {
    console.error(`    ⚠ Error: ${e.message}`);
    return false;
  }
}

// Find all files by extension
function findFiles(dir, ext, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      findFiles(full, ext, fileList);
    } else if (file.endsWith(ext)) {
      fileList.push(full);
    }
  }
  return fileList;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Asset Downloader — Full Scan');
  console.log('═══════════════════════════════════════\n');

  // Scan all HTML files
  console.log('── Scanning HTML files ─────────────────');
  const htmlFiles = findFiles(PUBLIC_DIR, '.html');
  console.log(`  Found ${htmlFiles.length} HTML files`);
  htmlFiles.forEach(scanHtml);

  // Also scan existing CSS files for url() references
  console.log('── Scanning CSS files ──────────────────');
  const cssFiles = findFiles(PUBLIC_DIR, '.css');
  console.log(`  Found ${cssFiles.length} CSS files`);
  cssFiles.forEach(scanCss);

  console.log(`\n── Downloading ${queue.size} assets ────────────────`);

  // Process queue
  const queueArray = Array.from(queue);
  let downloaded = 0;
  let skipped = 0;
  for (const item of queueArray) {
    downloadedAssets.add(item);
    const savePath = path.join(PUBLIC_DIR, item.split('?')[0]);
    if (fs.existsSync(savePath)) {
      skipped++;
      continue;
    }
    const result = await downloadFile(item);
    if (result && item.split('?')[0].endsWith('.css')) {
      scanCss(result); // CSS may reference more assets
    }
    if (result) downloaded++;
  }

  // Second pass for assets discovered in CSS
  const newItems = Array.from(queue).filter(x => !downloadedAssets.has(x));
  if (newItems.length > 0) {
    console.log(`\n── ${newItems.length} additional assets from CSS ───────`);
    for (const item of newItems) {
      downloadedAssets.add(item);
      await downloadFile(item);
    }
  }

  // Third pass
  const finalItems = Array.from(queue).filter(x => !downloadedAssets.has(x));
  if (finalItems.length > 0) {
    for (const item of finalItems) {
      downloadedAssets.add(item);
      await downloadFile(item);
    }
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  ✅ Done! Downloaded: ${downloaded}, Skipped (exist): ${skipped}`);
  console.log(`  Total assets tracked: ${downloadedAssets.size}`);
  console.log('═══════════════════════════════════════\n');
}

main().catch(console.error);
