export const kinds = ['scene','add','text','color','image','move','scale','visibility','preview'];
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
    if (request === 'CreateInput') simulated.inputs.push({inputName:action.source,inputKindUnversioned:args.inputKind.replace(/_v\d+$/,'')});
    if (request === 'CreateInput' || request === 'CreateSceneItem')
      simulated.scenes.find(scene => scene.sceneName === action.scene).items.push({sourceName:action.source});
    return action;
  });
}

export async function verifyChange(obs,request,args) {
  const equal = (actual,expected) => Object.entries(expected).every(([key,value]) => typeof value === 'number' ? Math.abs(actual?.[key] - value) < 0.001 : (actual?.[key] ?? (key === 'read_from_file' ? false : undefined)) === value);
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
