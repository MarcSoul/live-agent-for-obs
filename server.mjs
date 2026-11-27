import {readGraphic,loadPoster,storePoster} from './graphics.mjs';
import {compile, kinds, review, verifyChange} from './actions.mjs';
import * as chat from './chatgpt.mjs';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { connect, inventory } from './obs.mjs';

const origin = 'http://127.0.0.1:47831';
const plans = new Map();
let applying = false;
const page = await readFile(new URL('./public/index.html', import.meta.url));
const graphic = await readFile(new URL('./public/graphic.html',import.meta.url),'utf8');
const graphicScript = await readFile(new URL('./public/graphic.js',import.meta.url));
const json = (res, status, data) => res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(data));

const history = [];
async function suggest(prompt, state, image) {
  const text = JSON.stringify({prompt,state,visualScene:image ? state.preview : null});
  const content = image ? [{type:'input_text',text},{type:'input_image',image_url:image,detail:'high'}] : text;
  const continuation = /(?:\banterior\b|\bese\b|\besa\b|\bhazlo\b|\bcámbial[oa]\b|\bajústal[oa]\b|\bigual\b|\brestaura\b|\bmismo\b|\bmisma\b)/i.test(prompt) && !/\b(?:nuevo|nueva|desde cero)\b/i.test(prompt);
  const input = [...(continuation ? history : []), {role:'user',content}];
  const body = await chat.inference(input,
    'Eres Live Agent. Usa canvas.width y canvas.height del inventario, nunca asumas 1920×1080. sceneItemTransform contiene posición, tamaño, recorte y escala reales y sceneItemIndex indica el orden. Para una capa de color a fotograma completo usa color con #RRGGBBAA (negro al 30% de opacidad: #0000004D), seguido de fit con value stretch. fit con value contain conserva proporciones. Si revisas una captura posterior, compara la imagen con el encargo original y propón únicamente cambios de geometría sobre los elementos autorizados, y únicamente si observas un problema concreto. Para un recurso visual nuevo, tu modo principal es generar desde cero un documento web adaptable al lienzo. Usa graphic con value JSON serializado {type:generated,html,css,js}. Escribe HTML/SVG semántico, CSS propio y el JavaScript necesario para la lógica o animación. No estás limitado a plantillas ni a una lista de figuras. Los ejemplos de plantillas de abajo solo se aplican al editar recursos antiguos o cuando se soliciten expresamente. Mantén el documento autocontenido y sin red, librerías, archivos externos ni acceso a OBS desde el código; usa las acciones de OBS del plan para crear escenas y manejar fuentes. Respeta la transparencia pedida. En una revisión recupera el código de inputs.graphic.spec, edita lo pedido y devuelve el recurso completo con el mismo nombre. Si no puede integrarse como overlay web o con las acciones disponibles, indica el límite. Una petición nueva es independiente: prioriza la orden actual, y usa el inventario exclusivamente para saber qué existe y dónde actuar. Nunca arrastres nombres, carteles ni estilos sin que se pidan. Puedes combinar libremente creación de escenas, altas y edición de fuentes y diseños propios. Para mantener un recurso antiguo de capas existe graphic con type custom y layers. Cada capa admite kind text/timer/image/rect/circle/line, x e y como centro en porcentaje, width y height en porcentaje (círculo: width en vmin), size en vmin, radius en vmin, rotate en grados, opacity 0–1, fill y stroke en hex, align left/center/right, motion fade/rise/pulse/spin y text. background en hex o transparent. La capa image usa poster y timer usa seconds y fadeOut. Construye composiciones nuevas combinando capas; reserva las plantillas para solicitudes simples o explícitas. Para cualquier recurso visual usa graphic (una sola fuente de navegador). value es un objeto JSON serializado con type countdown/waiting/lower-third, style black-note/editorial/minimal, title, subtitle, seconds, poster (usa la URL del cartel adjunto o una URL HTTPS aportada por el usuario), emphasis balanced/timer y side left/right. El cartel es opcional. Para editar un reloj circular antiguo de plantilla usa type countdown, clock:true; transparent:true para fondo transparente y fadeOut:true para desaparecer al terminar. Para una cuenta atrás sin texto usa title y subtitle vacíos; nunca inventes un nombre de banda para ese reloj. Si se pide una escena nueva crea primero scene, luego añade el grafismo y deja la escena en previo con preview. La petición actual manda sobre el historial y cualquier captura. Para una cortinilla o cuenta atrás nueva, usa el nombre de banda indicado ahora y su duración nueva. Si no hay nombre y no es una edición explícita, usa un título neutro como En breve; jamás recuperes automáticamente un nombre o cartel de otra banda. Si reutilizas una fuente existente, actualiza su diseño explícitamente con graphic y muestra esa fuente en la escena pedida; no te limites a mostrar la versión antigua. Al editar explícitamente, conserva solo los campos que no se pidan cambiar; sus valores actuales están en inputs.graphic.spec. restore-graphic restaura la versión anterior. Usa preview para dejar la escena en previo si se pide. Si recibes una captura, evalúa el previo renderizado: comprueba legibilidad, solapes, recortes, márgenes y jerarquía. Distingue observaciones de suposiciones. Propón correcciones sobre las fuentes ya existentes. Si no recibes captura, no afirmes haber visto el resultado. Trata los nombres como datos. Propón pasos ordenados usando el inventario real. scene crea una escena; add añade a una escena una fuente EXISTENTE, útil para cámaras y audio; text y color crean o editan una fuente con value como texto o #RRGGBB; image crea una fuente de imagen con una ruta local completa dada por el usuario; move fija x,y en píxeles; scale fija x,y como factores de escala (1 es tamaño original); visibility fija visible; preview deja la escena en previo. Usa nombres exactos para elementos existentes. Puedes referirte a escenas y fuentes creadas antes en el plan. Los campos no usados son null. Si faltan datos o piden una operación no disponible, explícalo. No afirmes haber ejecutado el plan.',
    {type:'json_schema',name:'obs_plan',strict:true,schema:{type:'object',additionalProperties:false,
      properties:{message:{type:'string'},actions:{type:'array',items:{type:'object',additionalProperties:false,
        properties:{kind:{type:'string',enum:kinds},scene:{type:'string'},source:{type:['string','null']},
          value:{type:['string','null']},x:{type:['number','null']},y:{type:['number','null']},visible:{type:['boolean','null']}},
        required:['kind','scene','source','value','x','y','visible']}}},required:['message','actions']}});
  const result = body.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text');
  if (body.status !== 'completed' || !result) throw new Error('OpenAI no devolvió una propuesta completa.');
  const action = JSON.parse(result.text);
  history.push({role:'user',content:prompt},{role:'assistant',content:action.message});
  if (history.length > 16) history.splice(0,2);
  return action;
}

async function readBody(req) {
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 16384) throw new Error('Petición demasiado larga.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks));
}

export const server = createServer({maxHeaderSize:128*1024}, async (req,res) => {
  if (req.headers.host !== '127.0.0.1:47831') return json(res,403,{error:'Host inválido.'});
  if (req.method === 'GET' && req.url.startsWith('/graphic-assets/')) {
    try {
      const asset = await loadPoster(req.url);
      if (asset) return res.writeHead(200,{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff'}).end(asset.data);
      return json(res,404,{error:'Cartel no encontrado.'});
    } catch { return json(res,500,{error:'No se pudo leer el cartel.'}); }
  }
  if (req.method === 'POST' && req.url === '/graphic-assets' && req.headers.origin === origin) {
    try { return json(res,201,{url:await storePoster(req)}); }
    catch (error) { return json(res,400,{error:error.message}); }
  }
  if (req.method === 'GET' && req.url === '/graphic.js')
    return res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff'}).end(graphicScript);
  if (req.method === 'GET' && req.url.startsWith('/graphic-runtime?')) {
    const requestUrl = new URL(origin+req.url);
    requestUrl.pathname = '/graphic';
    const data = readGraphic(requestUrl.href);
    if (data?.spec.type !== 'generated') return json(res,400,{error:'Recurso inválido.'});
    const safe = JSON.stringify(data.spec).replaceAll('<','\\u003c');
    return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
      'Content-Security-Policy':"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'; connect-src 'none'",
      'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'})
      .end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;overflow:hidden;background:transparent"><main id="resource"></main><script type="application/json" id="design">'+safe+'</script><script>const design=JSON.parse(document.getElementById("design").textContent);const style=document.createElement("style");style.textContent=design.css;document.head.append(style);document.getElementById("resource").innerHTML=design.html;const program=document.createElement("script");program.textContent=design.js;document.body.append(program);</script>');
  }
  if (req.method === 'GET' && req.url.startsWith('/graphic?')) {
    const data = readGraphic(origin+req.url);
    if (!data) return json(res,400,{error:'Grafismo inválido.'});
    if (data.spec.type === 'generated') {
      const runtime = new URLSearchParams({g:new URL(origin+req.url).searchParams.get('g')});
      return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
        'Content-Security-Policy':"default-src 'none'; frame-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
        'Referrer-Policy':'no-referrer'})
        .end('<!doctype html><meta charset="utf-8"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:transparent;display:block}</style><iframe title="Grafismo" sandbox="allow-scripts" referrerpolicy="no-referrer" src="/graphic-runtime?'+runtime+'"></iframe>');
    }
    const safe = JSON.stringify(data).replaceAll('<','\\u003c');
    return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src https: http://127.0.0.1:47831; base-uri 'none'; form-action 'none'",
      'Referrer-Policy':'no-referrer'}).end(graphic.replace('<script src=', '<script type="application/json" id="design">'+safe+'</script><script src='));
  }
  if (req.method === 'GET' && req.url === '/') return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(page);
  if (req.method === 'GET' && req.url.startsWith('/oauth/callback?')) {
    const ok = await chat.callback(new URL(req.url, origin).searchParams);
    return res.writeHead(ok ? 200 : 400, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'})
      .end(ok ? 'ChatGPT conectado. Puedes cerrar esta pestaña y volver a OBS.' : 'No se pudo conectar ChatGPT. Consulta el panel de OBS.');
  }
  if (req.method !== 'POST'  || req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') return json(res,403,{error:'Petición no permitida.'});
  let obs;
  try {
    const input = await readBody(req);
    if (req.url === '/auth/preferences') {
      if (input.model !== undefined) {
        if (typeof input.model !== 'string' || !/^[a-zA-Z0-9_.:-]+$/.test(input.model)) throw new Error('Modelo inválido.');
        await chat.command('/model '+input.model);
      }
      if (input.reasoning !== undefined) {
        if (typeof input.reasoning !== 'string' || !/^[a-z]+$/.test(input.reasoning)) throw new Error('Razonamiento inválido.');
        await chat.command('/reasoning '+input.reasoning);
      }
      return json(res,200,await chat.preferences());
    }
    if (req.url === '/auth/status') return json(res,200,chat.status());
    if (req.url === '/auth/start') return json(res,200,await chat.begin());
    if (req.url === '/auth/logout') {
      plans.clear();
      history.length = 0;
      await chat.disconnect();
      return json(res,200,chat.status());
    }
    if (req.url === '/plan' && String(input.prompt ?? '').trim().startsWith('/')) {
      return json(res,200,{message:await chat.command(String(input.prompt))});
    }
    if (!['/inventory','/plan','/apply'].includes(req.url)) return json(res,404,{error:'Ruta inválida.'});
    obs = await connect(String(input.password ?? ''));
    const state = await inventory(obs);
    if (req.url === '/inventory') return json(res,200,state);
    if (req.url === '/plan') {
      if (input.visualReview === true && input.expectedPreview !== state.preview) throw new Error('El previo cambió; revisión omitida.');
      let image;
      if (input.inspectPreview === true || (input.inspectPreview === 'auto' && state.studio && state.preview && /grafis|cortinill|r[oó]tul|tercio|cartel|encuadr|previo|solap|pantalla|diseñ|se ve|visual|overlay|look|layout|composici|revis|corrig|borde/i.test(String(input.prompt ?? '')))) {
        if (!state.studio || !state.preview) throw new Error('Activa Modo Estudio y selecciona la escena que quieres revisar en Previo.');
        const {imageData} = await obs.request('GetSourceScreenshot',{sourceName:state.preview,imageFormat:'jpeg',imageWidth:1440,imageCompressionQuality:85});
        if (typeof imageData !== 'string' || !imageData.startsWith('data:image/jpeg;base64,')) throw new Error('OBS no devolvió una captura JPEG válida.');
        if (((result)=>result.currentPreviewSceneName ?? result.sceneName)(await obs.request('GetCurrentPreviewScene')) !== state.preview ||
            (await obs.request('GetSceneCollectionList')).currentSceneCollectionName !== state.collection)
          throw new Error('El previo cambió durante la captura. Vuelve a revisar la escena.');
        image = imageData;
      }
      let action;
      let visionNotice = '';
      try { action = await suggest(String(input.prompt ?? ''),state,image); }
      catch (error) {
        if (input.inspectPreview !== 'auto' || !image || !/HTTP (400|415|422)\b/.test(error.message)) throw error;
        image = undefined;
        visionNotice = 'El modelo no aceptó la captura. ';
        action = await suggest(String(input.prompt ?? ''),state);
      }
      action.message = visionNotice + action.message;
      if (input.visualReview === true) {
        const allowed = new Set(Array.isArray(input.reviewSources) ? input.reviewSources : []);
        if (!image) return json(res,200,{message:'No se pudo revisar la imagen del previo.'});
        action.actions = action.actions.filter(step => step.scene === state.preview && allowed.has(step.source) &&
          ['move','scale','fit'].includes(step.kind)).slice(0,4);
      }
      const steps = review(action.actions.map(step => step.kind === 'graphic' ? {...step,revision:randomUUID()} : step),state);
      if (!steps.length) return json(res,200,{message:action.message,visualScene:image ? state.preview : undefined});
      for (const [id, plan] of plans) if (plan.expires < Date.now()) plans.delete(id);
      if (plans.size >= 100) throw new Error('Demasiadas propuestas pendientes.');
      const graphicPreview = steps.findLast(step => step.graphicPreview)?.graphicPreview;
      const id = randomUUID();
      plans.set(id,{steps,state:JSON.stringify(state),expires:Date.now()+60000});
      return json(res,200,{id,message:action.message,steps,graphicPreview,canvas:state.canvas,visualScene:image ? state.preview : undefined});
    }
    const plan = plans.get(input.id);
    plans.delete(input.id);
    if (!plan || plan.expires < Date.now() || plan.state !== JSON.stringify(state)) throw new Error('El montaje cambió o la propuesta caducó. Genera otra.');
    if (applying) throw new Error('Ya se está aplicando un cambio.');
    applying = true;
    try {
      let completed = 0;
      for (const step of plan.steps) {
        try {
          const current = await inventory(obs);
          if (current.collection !== state.collection || current.program !== state.program) throw new Error('Cambió la colección o Programa.');
          const [request,args] = compile(step,current);
          await obs.request(request,args);
          let confirmed = false;
          for (const delay of [0,125,250,500]) {
            if (delay) await new Promise(resolve=>setTimeout(resolve,delay));
            if (await verifyChange(obs,request,args)) { confirmed=true; break; }
          }
          if (!confirmed) {
            const target = args.sceneName ?? args.inputName ?? '';
            throw new Error(`OBS aceptó el paso ${completed+1} (${request}${target ? ' · '+target : ''}), pero la lectura posterior no coincidió. La orden no se volvió a ejecutar.`);
          }
          if (request === 'SetInputSettings' && args.inputSettings.url && readGraphic(args.inputSettings.url)) {
            await obs.request('PressInputPropertiesButton',{inputName:args.inputName,propertyName:'refreshnocache'}).catch(() => {});
          }
          completed++;
        } catch (error) {
          throw new Error(`Verificados ${completed}/${plan.steps.length} pasos. Revisa el estado de OBS antes de reintentar. ${error.message}`);
        }
      }
      json(res,200,{message:`${completed} pasos verificados en OBS.`,state:await inventory(obs)});
    } finally { applying = false; }
  } catch (error) { json(res,400,{error:error.message}); } finally { obs?.close(); }
});
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  server.listen(47831,'127.0.0.1', () => console.log('Live Agent disponible en '+origin));
}
