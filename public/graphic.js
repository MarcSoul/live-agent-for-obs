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
if (spec.type === 'countdown') {
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
