import png2icons from 'png2icons';
import electronPath from 'electron';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const SOURCE = path.join(BUILD, 'logo-source.png');

if (!fs.existsSync(SOURCE)) {
  console.error(`Missing ${path.relative(ROOT, SOURCE)}`);
  process.exit(1);
}

const CANVAS = 1024;
const INSET = 100;
const ART = CANVAS - INSET * 2;

function squirclePath(size, n = 5, steps = 720) {
  const r = size / 2;
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = r + Math.sign(c) * Math.abs(c) ** (2 / n) * r;
    const y = r + Math.sign(s) * Math.abs(s) ** (2 / n) * r;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

const logoDataUrl = `data:image/png;base64,${fs.readFileSync(SOURCE).toString('base64')}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent}
  svg{display:block}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <clipPath id="squircle" clipPathUnits="userSpaceOnUse">
      <path transform="translate(${INSET},${INSET})" d="${squirclePath(ART)}"/>
    </clipPath>
  </defs>
  <g clip-path="url(#squircle)">
    <image href="${logoDataUrl}" x="${INSET}" y="${INSET}" width="${ART}" height="${ART}"
           preserveAspectRatio="xMidYMid slice"/>
  </g>
</svg>
</body></html>`;

const tmpHtml = path.join(BUILD, '.icon-render.html');
fs.writeFileSync(tmpHtml, html);

const renderedPath = path.join(BUILD, '.icon-render.png');
execFileSync(electronPath, [path.join(ROOT, 'scripts/icon-render.cjs'), tmpHtml, renderedPath], {
  stdio: 'ignore',
  timeout: 120_000,
});
if (process.platform === 'darwin') {
  execFileSync(
    'sips',
    [
      '-s',
      'format',
      'png',
      '-z',
      String(CANVAS),
      String(CANVAS),
      renderedPath,
      '--out',
      renderedPath,
    ],
    { stdio: 'ignore' },
  );
}
const rounded = fs.readFileSync(renderedPath);
fs.unlinkSync(renderedPath);
fs.unlinkSync(tmpHtml);

const roundedPath = path.join(BUILD, 'icon.png');
fs.writeFileSync(roundedPath, rounded);

const squarePath = path.join(BUILD, 'icon-square.png');
if (process.platform === 'darwin') {
  execFileSync(
    'sips',
    ['-s', 'format', 'png', '-z', String(CANVAS), String(CANVAS), SOURCE, '--out', squarePath],
    { stdio: 'ignore' },
  );
} else {
  fs.copyFileSync(SOURCE, squarePath);
}

const icns = png2icons.createICNS(rounded, png2icons.BILINEAR, 0);
if (!icns) throw new Error('createICNS failed');
fs.writeFileSync(path.join(BUILD, 'icon.icns'), icns);

const ico = png2icons.createICO(fs.readFileSync(squarePath), png2icons.BILINEAR, 0, true, true);
if (!ico) throw new Error('createICO failed');
fs.writeFileSync(path.join(BUILD, 'icon.ico'), ico);

const report = ['icon.icns', 'icon.ico', 'icon.png'].map((f) => {
  const stat = fs.statSync(path.join(BUILD, f));
  return `${f} ${(stat.size / 1024).toFixed(0)}KB`;
});
console.log('icons written:', report.join(', '));
