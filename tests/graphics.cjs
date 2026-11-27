const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
(async () => {
const load = name => import(pathToFileURL(path.resolve(name)));
const {compile,review} = await load('actions.mjs');
const {readGraphic} = await load('graphics.mjs');
const {server} = await load('server.mjs');
const spec={type:'countdown',title:'Black Note presenta «'+'NOMBRE LARGO '.repeat(7)+'»',subtitle:'Concierto en directo · '.repeat(6),style:'black-note',seconds:120,poster:'https://example.com/cartel.jpg'};
const state={studio:true,program:'Directo',preview:'Ensayo',scenes:[{sceneName:'Ensayo',items:[]}],inputs:[],inputKinds:['browser_source'],canvas:{width:1920,height:1080}};
const create={kind:'graphic',scene:'Ensayo',source:'Entrada',value:JSON.stringify(spec)};
const edited={...create,value:JSON.stringify({...spec,emphasis:'timer'})};
const steps=review([create,edited,{...create,kind:'restore-graphic'}],state);
assert.equal(steps.length,3);
assert.equal(readGraphic(steps[1].graphicPreview).previous.title,spec.title);
assert.equal(readGraphic(steps[2].graphicPreview).spec.emphasis,'balanced');
assert.equal(compile(create,state)[1].inputSettings.width,1920);
assert.throws(()=>compile(create,{...state,program:'Ensayo'}));
await new Promise(resolve=>server.listen(47831,'127.0.0.1',resolve));
let browser;
try {
browser=await chromium.launch({channel:'msedge'});
const page=await browser.newPage();
const dock=await browser.newPage();
await dock.goto('http://127.0.0.1:47831/');
await dock.locator('#graphicPreview').evaluate((iframe,url)=>{iframe.src=url;iframe.hidden=false},steps[0].graphicPreview);
await dock.frameLocator('#graphicPreview').locator('h1').filter({hasText:spec.title}).waitFor({timeout:10000});

await page.route('https://example.com/cartel.jpg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="black"/></svg>'}));
for (const [width,height] of [[1920,1080],[1080,1920],[300,169],[260,462]]) {
 await page.setViewportSize({width,height});
 for (const type of ['countdown','waiting','lower-third']) {
  const step=review([{...create,value:JSON.stringify({...spec,type})}],state)[0];
  await page.goto(step.graphicPreview);
  await page.locator('h1').waitFor();
  if(type!=='lower-third') await page.locator('.poster').waitFor();
  await page.waitForFunction(()=>document.getAnimations().every(a=>a.effect.getTiming().iterations===Infinity || a.playState==='finished'));
  assert.equal(await page.locator('h1').textContent(),spec.title);
  const box=await page.locator('.layout').boundingBox();
  assert(box.x>=0 && box.y>=0 && box.x+box.width<=width+1 && box.y+box.height<=height+1,JSON.stringify({width,height,type,box}));
  if(type==='countdown') assert.match(await page.locator('.timer').textContent(),/^0[12]:\d\d$/);
 }
}
console.log('12 renderizados y validación de creación, edición y restauración: OK');
} finally { await browser?.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
