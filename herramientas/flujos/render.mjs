// Dibuja los flujos de flujos.json con Mermaid en un Chrome sin ventana y los pega como SVG
// en los bloques "Cómo funciona" de index.html (una versión en español y otra en inglés).
// Uso: PUPPETEER=<ruta a puppeteer-core> node herramientas/flujos/render.mjs
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(aqui, '..', '..', 'index.html');
const flujos = JSON.parse(fs.readFileSync(path.join(aqui, 'flujos.json'), 'utf8'));
const puppeteer = createRequire(import.meta.url)(process.env.PUPPETEER || 'puppeteer-core');

const CONFIG = {
  startOnLoad: false, theme: 'base', htmlLabels: false,
  flowchart: { htmlLabels: false, curve: 'basis', nodeSpacing: 34, rankSpacing: 46, padding: 12 },
  fontFamily: 'Geist Mono, ui-monospace, Menlo, monospace',
  themeVariables: {
    background: 'transparent', fontSize: '13px', fontFamily: 'Geist Mono, ui-monospace, Menlo, monospace',
    primaryColor: '#0d0d0d', primaryBorderColor: '#3a3a3a', primaryTextColor: '#f2f2f2',
    secondaryColor: '#0d0d0d', tertiaryColor: '#0d0d0d', lineColor: '#5c5c5c',
    edgeLabelBackground: '#000000', clusterBkg: '#0d0d0d',
  },
};

const navegador = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const pagina = await navegador.newPage();
await pagina.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=block" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script></head><body></body></html>`, { waitUntil: 'networkidle0' });
await pagina.evaluate(async c => { await document.fonts.load('13px "Geist Mono"'); mermaid.initialize(c); }, CONFIG);

let html = fs.readFileSync(INDEX, 'utf8');
for (const [id, idiomas] of Object.entries(flujos)) {
  const svgs = {};
  for (const [lang, def] of Object.entries(idiomas)) {
    const texto = def + '\n  classDef destacado stroke:#b26bff,stroke-width:1.5px;';
    svgs[lang] = await pagina.evaluate(async (i, t) => (await mermaid.render(i, t)).svg, `flujo-${id}-${lang}`, texto);
  }
  const caja = `<div class="diagrama-caja"><div lang="es">${svgs.es}</div><div lang="en">${svgs.en}</div></div>`;
  const patron = new RegExp(`(id="como-${id}">[\\s\\S]*?)<div class="diagrama-caja">[\\s\\S]*?</div>(<div class="ejemplo">)`);
  if (!patron.test(html)) throw new Error(`No encontré el bloque como-${id}`);
  html = html.replace(patron, (_, antes, despues) => antes + caja + despues);
  console.log('listo', id);
}
fs.writeFileSync(INDEX, html);
await navegador.close();
