import {graphicSpec,graphicUrl,readGraphic} from './graphics.mjs';
export const kinds = ['scene','add','text','color','image','move','scale','visibility','preview','graphic','restore-graphic'];
const fail = message => { throw new Error(message); };
const contains = (items, name) => items.some(item => item.sourceName === name || contains(item.children ?? [],name));

export function compile(action,state) {
  const {kind,scene:name,source,value,x,y,visible} = action;
  if (!state.studio) fail('Activa el Modo Estudio.');
  if (!name?.trim() || name.length > 160) fail('Indica un nombre de escena válido.');
  const scene = state.scenes.find(entry => entry.sceneName === name);
  const input = state.inputs.find(entry => entry.inputName === source);
  const args = {sceneName:name};
  const exists = candidate => state.scenes.some(entry => entry.sceneName === candidate) ||
    state.inputs.some(entry => entry.inputName === candidate);
  if (kind === 'scene') {
    if (exists(name)) fail('Ya existe una escena o fuente llamada '+name+'.');
    return ['CreateScene',args];
  }
  if (!scene || name === state.program) fail('Elige una escena distinta de Programa.');
  if (kind === 'preview') return ['SetCurrentPreviewScene',args];
  if (state.scenes.some(parent => contains(parent.items,name))) fail('La escena se utiliza dentro de otra escena.');
  if (!source?.trim() || source.length > 160) fail('Indica un nombre de fuente válido.');
  const matches = scene.items.filter(item => item.sourceName === source);
  if (kind === 'add') {
    if (!input || matches.length) fail('Elige una fuente existente que aún no esté en la escena.');
    return ['CreateSceneItem',{...args,sourceName:source,sceneItemEnabled:true}];
  }
  if (kind === 'graphic' || kind === 'restore-graphic') {
    if (!state.inputKinds.includes('browser_source')) fail('OBS necesita el componente Fuente de navegador.');
    if (kind === 'restore-graphic' && !input?.graphic?.previous) fail('Este grafismo no tiene una versión anterior.');
    if (exists(source) && (!input?.graphic || matches.length !== 1 ||
        state.scenes.some(parent => parent.sceneName !== name && contains(parent.items,source)) ||
        scene.items.some(item => contains(item.children ?? [],source)))) fail('El grafismo debe pertenecer solo a esa escena.');
    const spec = kind === 'graphic' ? graphicSpec(value) : input.graphic.previous;
    const width = state.canvas?.width, height = state.canvas?.height;
    if (![width,height].every(n => Number.isInteger(n) && n >= 16 && n <= 8192)) fail('El tamaño de lienzo no es compatible.');
    const url = new URL(graphicUrl(spec,input?.graphic?.spec));
    if (action.revision) url.searchParams.set('revision',action.revision);
    const inputSettings = {url:url.href,width,height,is_local_file:false,webpage_control_level:0,shutdown:false,restart_when_active:false};
    if (input) return ['SetInputSettings',{inputName:source,inputSettings,overlay:true}];
    return ['CreateInput',{...args,inputName:source,inputKind:'browser_source',inputSettings,sceneItemEnabled:true}];
  }
  if (kind === 'image') {
    if (exists(source) || !state.inputKinds.includes('image_source')) fail('Elige un nombre nuevo y comprueba que OBS admite fuentes de imagen.');
    if (typeof value !== 'string' || !/^[a-z]:[\\/].+\.(png|jpe?g|webp|bmp|gif)$/i.test(value))
      fail('Indica la ruta local completa de la imagen en Windows.');
    return ['CreateInput',{...args,inputName:source,inputKind:'image_source',inputSettings:{file:value},sceneItemEnabled:true}];
  }
  if (kind === 'text' || kind === 'color') {
    const inputKind = state.inputKinds.find(id => kind === 'text' ? /^text_gdiplus(?:_v\d+)?$/.test(id) : /^color_source(?:_v\d+)?$/.test(id));
    if (!inputKind) fail('Este tipo de fuente no está instalado en OBS.');
    if (typeof value !== 'string' || value.length > 4000) fail('Contenido de fuente inválido.');
    if (kind === 'color' && !/^#[a-f0-9]{6}$/i.test(value)) fail('Usa un color hexadecimal #RRGGBB.');
    const inputSettings = kind === 'text' ? {text:value} :
      {color:(0xff000000 | parseInt(value.slice(5,7)+value.slice(3,5)+value.slice(1,3),16)) >>> 0};
    if (!exists(source)) return ['CreateInput',{...args,inputName:source,inputKind,inputSettings,sceneItemEnabled:true}];
    if (matches.length !== 1 || input?.inputKindUnversioned !== inputKind.replace(/_v\d+$/,'') ||
        state.scenes.some(parent => parent.sceneName !== name && contains(parent.items,source)) ||
        scene.items.some(item => contains(item.children ?? [],source))) fail('La fuente ya existe y no se puede editar de forma aislada.');
    return ['SetInputSettings',{inputName:source,inputSettings:kind === 'text' ? {...inputSettings,read_from_file:false} : inputSettings,overlay:true}];
  }
  if (matches.length !== 1) fail('La fuente debe aparecer una sola vez en esa escena.');
  args.sceneItemId = matches[0].sceneItemId;
  if (kind === 'visibility' && typeof visible === 'boolean') return ['SetSceneItemEnabled',{...args,sceneItemEnabled:visible}];
  if (kind === 'move' && [x,y].every(n => Number.isFinite(n) && Math.abs(n) <= 32768))
    return ['SetSceneItemTransform',{...args,sceneItemTransform:{positionX:x,positionY:y}}];
  if (kind === 'scale' && [x,y].every(n => Number.isFinite(n) && n >= 0.01 && n <= 20))
    return ['SetSceneItemTransform',{...args,sceneItemTransform:{scaleX:x,scaleY:y}}];
  fail('Acción no admitida o parámetros inválidos.');
}

export function review(actions,state) {
  if (!Array.isArray(actions) || actions.length > 16) fail('El plan admite hasta 16 pasos.');
  const simulated = structuredClone(state);
  return actions.map(action => {
    const [request,args] = compile(action,simulated);
    if (request === 'CreateScene') simulated.scenes.push({sceneName:action.scene,items:[]});
    if (request === 'CreateInput') simulated.inputs.push({inputName:action.source,inputKindUnversioned:args.inputKind.replace(/_v\d+$/,''),graphic:readGraphic(args.inputSettings.url)});
    if (request === 'SetInputSettings' && args.inputSettings.url)
      simulated.inputs.find(input => input.inputName === action.source).graphic = readGraphic(args.inputSettings.url);
    if (request === 'CreateInput' || request === 'CreateSceneItem')
      simulated.scenes.find(scene => scene.sceneName === action.scene).items.push({sourceName:action.source});
    const graphicPreview = args.inputSettings?.url;
    return graphicPreview ? {...action,graphicPreview} : action;
  });
}

export async function verifyChange(obs,request,args) {
  const equal = (actual,expected) => Object.entries(expected).every(([key,value]) => typeof value === 'number' ? Math.abs((actual?.[key] ?? (key === 'webpage_control_level' ? 0 : NaN)) - value) < 0.001 : (actual?.[key] ?? (['read_from_file','is_local_file','shutdown','restart_when_active'].includes(key) ? false : undefined)) === value);
  if (request === 'SetCurrentPreviewScene') return (await obs.request('GetCurrentPreviewScene')).sceneName === args.sceneName;
  if (request === 'CreateScene') return (await obs.request('GetSceneList')).scenes.some(scene => scene.sceneName === args.sceneName);
  if (request === 'CreateSceneItem' || request === 'CreateInput') {
    const items = (await obs.request('GetSceneItemList',{sceneName:args.sceneName})).sceneItems;
    if (!items.some(item => item.sourceName === (args.inputName ?? args.sourceName))) return false;
  }
  if (request === 'CreateInput' || request === 'SetInputSettings')
    return equal((await obs.request('GetInputSettings',{inputName:args.inputName})).inputSettings,args.inputSettings);
  if (request === 'SetSceneItemEnabled')
    return (await obs.request('GetSceneItemEnabled',{sceneName:args.sceneName,sceneItemId:args.sceneItemId})).sceneItemEnabled === args.sceneItemEnabled;
  if (request === 'SetSceneItemTransform')
    return equal((await obs.request('GetSceneItemTransform',{sceneName:args.sceneName,sceneItemId:args.sceneItemId})).sceneItemTransform,args.sceneItemTransform);
  return true;
}
