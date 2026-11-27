import { createHash, randomBytes, randomUUID, createPublicKey, verify } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const issuer = 'https://auth.openai.com';
const resource = 'https://api.openai.com/v1';
const origin = 'http://127.0.0.1:47831';
const redirect = origin + '/oauth/callback';
const permission = 'chatgpt.tokens.use.direct';
const random = () => randomBytes(32).toString('base64url');
let attempt, session, refreshing, loginError, model;
let reasoning = 'default';
const levels = ['default','none','minimal','low','medium','high','xhigh'];

async function hostId() {
  if (!process.env.LOCALAPPDATA) throw new Error('El inicio de sesión está preparado para Windows.');
  const folder = join(process.env.LOCALAPPDATA, 'LiveAgent');
  await mkdir(folder, {recursive:true});
  const path = join(folder,'host-id');
  try { return await readFile(path,'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const id = 'urn:uuid:' + randomUUID();
    try { await writeFile(path,id,{flag:'wx'}); return id; }
    catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; return readFile(path,'utf8'); }
  }
}

export function status() {
  return {connected: Boolean(session), account:session?.account, pending:Boolean(attempt && attempt.expires > Date.now()), error:loginError};
}

export async function begin() {
  if (session) throw new Error('Desconecta primero la cuenta actual.');
  const host = await hostId();
  const state = random(), nonce = random(), verifier = random();
  attempt = {state,nonce,verifier,expires:Date.now()+300000};
  loginError = undefined;
  const url = new URL(issuer+'/api/accounts/authorize');
  url.search = new URLSearchParams({client_id:'dynamic_agent_client',agent_name_hint:'Live Agent',
    ext_agent_host_id:host,redirect_uri:redirect,response_type:'code',scope:'openid profile email offline_access resource.invoke '+permission,
    resource,state,nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
  await new Promise((resolve,reject) => {
    const child = spawn('rundll32.exe',['url.dll,FileProtocolHandler',url.href],{windowsHide:true,stdio:'ignore'});
    child.once('error',reject);
    child.once('exit',code => code === 0 ? resolve() : reject(new Error('Windows no pudo abrir el navegador predeterminado.')));
  });
  return status();
}

async function request(url, options = {}) {
  const response = await fetch(url,{...options,signal:AbortSignal.timeout(30000),redirect:'error'});
  if (!response.ok) throw new Error('ChatGPT devolvió HTTP '+response.status+'. Comprueba la sesión y la disponibilidad del modelo o nivel de razonamiento.');
  return response;
}

async function grant(fields) {
  return (await request(issuer+'/api/accounts/oauth/token',{method:'POST',body:new URLSearchParams({...fields,resource})})).json();
}

async function identity(token, client, nonce) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token de identidad inválido.');
  const [header, claims, signature] = parts;
  const h = JSON.parse(Buffer.from(header,'base64url'));
  const p = JSON.parse(Buffer.from(claims,'base64url'));
  const metadata = await (await request(issuer+'/.well-known/openid-configuration')).json();
  const jwks = new URL(metadata.jwks_uri);
  if (jwks.origin !== issuer || h.alg !== 'RS256') throw new Error('Firma de identidad no admitida.');
  const {keys} = await (await request(jwks)).json();
  const jwk = keys.find(key => key.kid === h.kid && key.kty === 'RSA');
  const audiences = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!jwk || !verify('RSA-SHA256',Buffer.from(header+'.'+claims),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(signature,'base64url')) ||
      p.iss !== issuer || !audiences.includes(client) || (audiences.length > 1 && p.azp !== client) ||
      !(p.exp > Date.now()/1000) || p.nonce !== nonce || !p.sub) throw new Error('No se pudo verificar la identidad de ChatGPT.');
  return p.email ?? 'Cuenta ChatGPT';
}

export async function callback(query) {
  const pending = attempt;
  if (!pending || pending.expires < Date.now() || query.get('state') !== pending.state) return false;
  try {
    const client = query.get('client_id'), code = query.get('code');
    if (query.has('error') || !client || client === 'dynamic_agent_client' || !code) throw new Error('Autorización cancelada o incompleta.');
    // Consume state before doing network I/O.
    pending.state = undefined;
    const token = await grant({grant_type:'authorization_code',client_id:client,code,code_verifier:pending.verifier,redirect_uri:redirect});
    if (!token.scope?.split(/\s+/).includes(permission) || !token.access_token) throw new Error('La cuenta no autorizó el uso de su plan.');
    const account = await identity(token.id_token,client,pending.nonce);
    if (attempt !== pending) return false;
    session = {client,account,token,expires:Date.now()+1000*token.expires_in};
    return true;
  } catch (error) { if (attempt === pending) loginError = error.message; return false; }
  finally { if (attempt === pending) attempt = undefined; }
}

export async function disconnect() {
  const previous = session;
  session = attempt = undefined;
  model = undefined;
  reasoning = 'default';
  if (!previous?.token.refresh_token) return;
  const metadata = await (await request(issuer+'/.well-known/openid-configuration')).json();
  const endpoint = new URL(metadata.revocation_endpoint);
  if (endpoint.origin !== issuer) throw new Error('Sesión local cerrada. Revisa el acceso en la configuración de ChatGPT.');
  await request(endpoint,{method:'POST',body:new URLSearchParams({token:previous.token.refresh_token,token_type_hint:'refresh_token',client_id:previous.client})});
}

async function access() {
  const active = session;
  if (!active) throw new Error('Conecta tu cuenta de ChatGPT desde el panel.');
  if (active.expires > Date.now()+30000) return active.token.access_token;
  if (!refreshing) refreshing = grant({grant_type:'refresh_token',client_id:active.client,refresh_token:active.token.refresh_token})
    .then(token => {
      if (session !== active || !token.access_token || (token.scope && !token.scope.split(/\s+/).includes(permission))) throw new Error('Vuelve a conectar ChatGPT.');
      active.token = {...active.token,...token};
      active.expires = Date.now()+1000*token.expires_in;
      return token.access_token;
    }).finally(() => { refreshing = undefined; });
  return refreshing;
}

async function models() {
  const result = await (await request(resource+'/models',{headers:{Authorization:'Bearer '+await access()}})).json();
  return (result.models ?? []).filter(item => item.visibility === 'list' && item.slug);
}

export async function command(text) {
  const [name, value, extra] = text.trim().split(/\s+/);
  if (extra) throw new Error('Usa un solo argumento para el comando.');
  if (name === '/model') {
    const catalog = await models();
    if (!catalog.length) throw new Error('La cuenta no devolvió modelos disponibles.');
    if (value && !catalog.some(item => item.slug === value)) throw new Error('Modelo no disponible. Escribe /model para ver los identificadores.');
    if (value) model = value;
    model ??= catalog[0].slug;
    return value ? 'Modelo activo: '+model : 'Modelo activo: '+model+'\n'+catalog.map(item => item.slug+' · '+item.display_name).join('\n');
  }
  if (name === '/reasoning') {
    if (value && !levels.includes(value)) throw new Error('Nivel inválido. Escribe /reasoning para ver las opciones.');
    if (value) reasoning = value;
    return 'Razonamiento: '+reasoning+'\nOpciones según el modelo: '+levels.join(', ');
  }
  throw new Error('Comandos disponibles: /model y /reasoning.');
}

export async function inference(input, instructions, format) {
  if (!model) await command('/model');
  const response = await request(resource+'/responses',{method:'POST',
    headers:{Authorization:'Bearer '+await access(),'Content-Type':'application/json'},
    body:JSON.stringify({model,store:false,stream:true,input,instructions,text:{format},
      ...(reasoning === 'default' ? {} : {reasoning:{effort:reasoning}})})});
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      buffer += value;
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop();
      for (const raw of events) {
        const data = raw.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        if (!data || data === '[DONE]') continue;
        const event = JSON.parse(data);
        if (event.type === 'response.completed') return event.response;
        if (['error','response.failed','response.incomplete'].includes(event.type)) throw new Error('ChatGPT no completó la respuesta.');
      }
    }
  } finally { await reader.cancel(); }
  throw new Error('La conexión se cerró antes de recibir la respuesta.');
}
