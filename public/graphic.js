'use strict';
const {spec} = JSON.parse(document.querySelector('#design').textContent);
const node = selector => document.querySelector(selector);
const layout = node('.layout');
const poster = node('.poster');
const title = node('h1');
const subtitle = node('.subtitle');
const timer = node('.timer');
document.body.dataset.type = spec.type;
document.body.dataset.style = spec.style;
document.body.dataset.emphasis = spec.emphasis;
document.body.dataset.side = spec.side;
title.textContent = spec.title;
title.hidden = !spec.title;
const stage = node('.stage');
stage.classList.toggle('transparent',spec.transparent);
node('.eyebrow').hidden = spec.clock && !spec.title;
let hand;
if (spec.clock) {
  const clock = document.createElement('div');
  clock.className = 'clock';
  const ticks = Array.from({length:60}, (_, i) =>
    '<line x1="50" y1="6" x2="50" y2="'+(i%5===0 ? 13 : 9)+'" transform="rotate('+(i*6)+' 50 50)" opacity="'+(i%5===0 ? 1 : .48)+'"/>').join('');
  clock.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1">'+ticks+'<line class="hand" x1="50" y1="4" x2="50" y2="14" stroke-width="2.5"/></svg>';
  timer.before(clock);
  clock.append(timer);
  hand = clock.querySelector('.hand');
}
subtitle.textContent = spec.subtitle;
subtitle.hidden = !spec.subtitle;
node('.eyebrow').textContent = spec.style === 'black-note' ? 'Black Note Club · En directo' : 'En directo';

function fit() {
  title.style.fontSize = '';
  subtitle.style.fontSize = '';
  const max = innerHeight * (spec.type === 'lower-third' ? .34 : .84);
  for (let i=0; i<16 && layout.offsetHeight > max; i++) {
    title.style.fontSize = Math.max(10,parseFloat(getComputedStyle(title).fontSize)*.86)+'px';
    subtitle.style.fontSize = Math.max(9,parseFloat(getComputedStyle(subtitle).fontSize)*.88)+'px';
  }
}
if (spec.poster && spec.type !== 'lower-third') {
  poster.onload = () => { poster.hidden = false; layout.classList.remove('no-poster'); fit(); };
  poster.src = spec.poster;
}
if (spec.type === 'custom') {
  stage.classList.add('free');
  stage.style.background = spec.transparent ? 'transparent' : spec.background;
  layout.hidden = true;
  const timers = [];
  for (const item of spec.layers) {
    const layer = document.createElement('div');
    layer.className = 'free-layer';
    layer.dataset.motion = item.motion;
    Object.assign(layer.style,{left:item.x+'%',top:item.y+'%',width:item.width+'%',height:item.height+'%',
      transform:'translate(-50%,-50%) rotate('+item.rotate+'deg)',opacity:item.opacity,color:item.fill,
      fontSize:item.size+'vmin',borderRadius:item.radius+'vmin',textAlign:item.align});
    if (item.kind === 'circle') {
      layer.style.width = item.width+'vmin';
      layer.style.height = item.width+'vmin';
      layer.style.borderRadius = '50%';
    }
    if (['rect','circle','line'].includes(item.kind)) {
      layer.style.background = item.fill;
      layer.style.border = '.2vmin solid '+item.stroke;
    } else if (item.kind === 'image' && spec.poster) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = spec.poster;
      layer.append(img);
    } else {
      const content = document.createElement('div');
      content.className = 'content';
      content.textContent = item.text;
      if (item.kind === 'timer') timers.push(content);
      layer.append(content);
    }
    stage.append(layer);
  }
  if (timers.length) {
    const end = Date.now()+spec.seconds*1000;
    const interval = setInterval(tick,100);
    function tick() {
      const left = Math.max(0,Math.ceil((end-Date.now())/1000));
      const label = [Math.floor(left/60),left%60].map(n=>String(n).padStart(2,'0')).join(':');
      for (const clock of timers) clock.textContent = label;
      if (!left) {
        clearInterval(interval);
        if (spec.fadeOut) {
          stage.classList.add('finished');
          setTimeout(()=>{stage.hidden=true;},1000);
        }
      }
    }
    tick();
  }
} else if (spec.type === 'countdown') {
  timer.hidden = false;
  const end = Date.now() + spec.seconds*1000;
  const tick = () => {
    const left = Math.max(0,Math.ceil((end-Date.now())/1000));
    timer.textContent = [Math.floor(left/60),left%60].map(part=>String(part).padStart(2,'0')).join(':');
    if (hand) hand.setAttribute('transform','rotate('+((left%60)*6)+' 50 50)');
    if (!left) {
      clearInterval(interval);
      if (spec.fadeOut) {
        stage.classList.add('finished');
        setTimeout(() => { stage.hidden = true; },1000);
      }
    }
  };
  const interval = setInterval(tick, 150);
  tick();
}
addEventListener('resize',fit);
requestAnimationFrame(fit);
