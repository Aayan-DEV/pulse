const { chromium } = require('/Users/aayan/Development/ECS/frontend/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file:///Users/aayan/Development/ECS/research/pulse/docs/pitch/deck.html');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  const n = await p.locator('.slide').count();
  for (let i = 0; i < n; i++) {
    const sl = p.locator('.slide').nth(i);
    await sl.evaluate(el => [...el.children].forEach(c => { if (!c.classList.contains('wash')) c.style.visibility = 'hidden'; }));
    const buf = await sl.screenshot({ type: 'jpeg', quality: 93 });
    await sl.evaluate((el, src) => {
      [...el.children].forEach(c => { c.style.visibility = ''; });
      const w = el.querySelector('.wash'); const img = document.createElement('img');
      img.src = src; img.className = 'wash'; img.style.cssText = 'position:absolute;inset:0;width:1920px;height:1080px;'; w.replaceWith(img);
    }, 'data:image/jpeg;base64,' + buf.toString('base64'));
  }
  await p.waitForTimeout(300);
  await p.pdf({ path: '/Users/aayan/Development/ECS/research/pulse/docs/pitch/pulse-pitch.pdf', width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true, margin: {top:0,right:0,bottom:0,left:0} });
  await b.close();
})();
