/**
 * Builds docs/img/social-preview.png (1280x640): the card shown when the repository link is shared.
 * GitHub does not let an API set it, so it is uploaded by hand in Settings > Social preview.
 *   node scripts/make-social-preview.mjs        (needs docs/img/form-lease.png, made by npm run screenshots)
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { chromium } from '@playwright/test';

const SHOT = 'docs/img/form-lease.png';
const OUT = 'docs/img/social-preview.png';
if (!existsSync(SHOT)) {
  console.error(`Missing ${SHOT}. Run "npm run screenshots" first.`);
  process.exit(1);
}
const shot = `data:image/png;base64,${readFileSync(SHOT).toString('base64')}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1280px;height:640px;background:linear-gradient(135deg,#0d1424 0%,#18264a 100%);font-family:Inter,'Segoe UI',system-ui,sans-serif;color:#fff;display:flex;overflow:hidden}
  .left{width:640px;padding:64px 0 0 72px}
  .tag{display:inline-block;background:#2457d6;border-radius:999px;padding:8px 18px;font-size:22px;font-weight:700;letter-spacing:.2px}
  h1{font-size:92px;line-height:1;margin:26px 0 8px;font-weight:800}
  .sub{font-size:34px;color:#b9c6e8;margin-bottom:38px}
  ul{list-style:none;padding:0}
  li{font-size:27px;margin:13px 0;display:flex;gap:14px;align-items:center}
  li b{color:#6fe0a0;font-size:30px}
  .right{flex:1;position:relative}
  .card{position:absolute;left:10px;top:72px;width:560px;border-radius:18px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.55);border:2px solid rgba(255,255,255,.18)}
  .card img{display:block;width:100%}
  .foot{position:absolute;left:72px;bottom:34px;font-size:22px;color:#8fa2d1}
</style></head><body>
  <div class="left">
    <span class="tag">Playwright · TypeScript</span>
    <h1>QuoteLab</h1>
    <div class="sub">QA automation showcase</div>
    <ul>
      <li><b>✓</b> 415 tests · UI and API</li>
      <li><b>✓</b> Every number checked by an independent oracle</li>
      <li><b>✓</b> Mutation check: 10 of 10 defects caught</li>
      <li><b>✓</b> CI green on every push</li>
    </ul>
  </div>
  <div class="right"><div class="card"><img src="${shot}"></div></div>
  <div class="foot">github.com/LucasBonno/qa-automation-showcase</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: OUT });
await browser.close();

const kb = Math.round(statSync(OUT).size / 1024);
console.log(`${OUT}: ${kb} KB${kb > 1000 ? ' (GitHub accepts at most 1 MB!)' : ''}`);
