import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';

const origin = 'http://127.0.0.1:47831';
const styles = ['black-note', 'editorial', 'minimal'];
const assetPath = /^\/graphic-assets\/([a-f0-9]{64})\.(png|jpg|webp)$/;
const mime = {png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
const assetDirectory = join(process.env.LOCALAPPDATA || homedir(),'LiveAgent','graphic-assets');

export async function storePoster(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8*1024*1024) throw new Error('El cartel supera 8 MB.');
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  const ext = data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) ? 'png' :
    data.subarray(0,3).equals(Buffer.from('ffd8ff','hex')) ? 'jpg' :
    data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP' ? 'webp' : undefined;
  if (!ext || req.headers['content-type'] !== mime[ext]) throw new Error('Selecciona un cartel PNG, JPEG o WebP válido.');
  const key = createHash('sha256').update(data).digest('hex')+'.'+ext;
  await mkdir(assetDirectory,{recursive:true});
  try { await writeFile(join(assetDirectory,key),data,{flag:'wx'}); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return origin+'/graphic-assets/'+key;
}

export async function loadPoster(path) {
  const match = assetPath.exec(path);
  if (!match) return null;
  try { return {data:await readFile(join(assetDirectory,match[1]+'.'+match[2])),type:mime[match[2]]}; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

const types = ['countdown', 'waiting', 'lower-third'];

export function graphicSpec(raw) {
  const input = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!input || !types.includes(input.type) || !styles.includes(input.style)) throw new Error('Tipo o estilo de grafismo inválido.');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const subtitle = typeof input.subtitle === 'string' ? input.subtitle.trim() : '';
  if ((input.type !== 'countdown' && !title) || title.length > 120 || subtitle.length > 160) throw new Error('El grafismo necesita un título de hasta 120 caracteres y un subtítulo de hasta 160.');
  const seconds = input.type === 'countdown' ? input.seconds ?? 120 : 0;
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) throw new Error('La cuenta atrás admite entre 0 y 3600 segundos.');
  let poster = '';
  if (input.poster) {
    const url = new URL(input.poster);
    if ((url.protocol !== 'https:' && !(url.origin === origin && assetPath.test(url.pathname) && !url.search && !url.hash)) || url.username || url.password || url.href.length > 1500)
      throw new Error('Adjunta el cartel o usa una URL HTTPS pública de imagen.');
    poster = url.href;
  }
  return {type:input.type,style:input.style,title,subtitle,seconds,poster,
    clock:input.type === 'countdown' && input.clock === true,
    transparent:input.transparent === true, fadeOut:input.fadeOut === true,
    emphasis:input.emphasis === 'timer' ? 'timer' : 'balanced',
    side:input.side === 'right' ? 'right' : 'left'};
}

const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
const decode = data => graphicSpec(JSON.parse(Buffer.from(data,'base64url').toString('utf8')));
export function readGraphic(value) {
  try {
    const url = new URL(value);
    if (url.origin !== origin || url.pathname !== '/graphic') return null;
    return {spec:decode(url.searchParams.get('g')), previous:url.searchParams.has('p') ? decode(url.searchParams.get('p')) : null};
  } catch { return null; }
}

export function graphicUrl(spec, previous) {
  const url = new URL('/graphic', origin);
  url.searchParams.set('g',encode(spec));
  if (previous) url.searchParams.set('p',encode(previous));
  return url.href;
}
