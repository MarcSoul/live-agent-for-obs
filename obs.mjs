import { createHash, randomUUID } from 'node:crypto';

const hash = text => createHash('sha256').update(text).digest('base64');

export async function connect(password) {
  const socket = new WebSocket('ws://127.0.0.1:4455');
  const pending = new Map();
  let ready;
  let fail;
  const identified = new Promise((resolve, reject) => { ready = resolve; fail = reject; });
  const timer = setTimeout(() => { fail(new Error('OBS no responde en el puerto 4455')); socket.close(); }, 5000);
  socket.addEventListener('error', () => fail(new Error('Activa el servidor WebSocket de OBS en Herramientas.')));
  socket.addEventListener('close', () => {
    const error = new Error('OBS cerró la conexión. Comprueba la contraseña y el servidor WebSocket.');
    fail(error);
    for (const finish of pending.values()) finish(null, error);
  });
  socket.addEventListener('message', event => {
    const { op, d } = JSON.parse(event.data);
    if (op === 0) {
      const auth = d.authentication;
      const authentication = auth ? hash(hash(password + auth.salt) + auth.challenge) : undefined;
      socket.send(JSON.stringify({op: 1, d: {rpcVersion: 1, authentication, eventSubscriptions: 0}}));
    }
    if (op === 2) ready();
    if (op === 7) pending.get(d.requestId)?.(d);
  });
  try { await identified; } catch (error) { socket.close(); throw error; } finally { clearTimeout(timer); }
  return {
    close: () => socket.close(),
    request(requestType, requestData = {}) {
      return new Promise((resolve, reject) => {
        const requestId = randomUUID();
        const finish = (response, error) => {
          clearTimeout(timeout);
          pending.delete(requestId);
          if (error) reject(error);
          else if (!response.requestStatus.result) reject(new Error(requestType + ': ' + (response.requestStatus.comment || response.requestStatus.code)));
          else resolve(response.responseData ?? {});
        };
        const timeout = setTimeout(() => finish(null, new Error('OBS no respondió a ' + requestType)), 5000);
        pending.set(requestId, finish);
        try { socket.send(JSON.stringify({op: 6, d: {requestType, requestId, requestData}})); }
        catch (error) { finish(null, error); }
      });
    }
  };
}

export async function inventory(obs) {
  const [list, mode, collection] = await Promise.all([
    obs.request('GetSceneList'), obs.request('GetStudioModeEnabled'), obs.request('GetSceneCollectionList')
  ]);
  async function items(container, group = false) {
    const result = await obs.request(group ? 'GetGroupSceneItemList' : 'GetSceneItemList', {sceneName: container});
    return Promise.all(result.sceneItems.map(async ({sceneItemId, sourceName, sourceUuid, sceneItemEnabled, isGroup}) => ({
      sceneItemId, sourceName, sourceUuid, sceneItemEnabled,
      ...(isGroup ? {children: await items(sourceName, true)} : {})
    })));
  }
  const scenes = await Promise.all(list.scenes.map(async ({sceneName, sceneUuid}) => ({
    sceneName, sceneUuid, items: await items(sceneName)
  })));
  return {collection: collection.currentSceneCollectionName, program: list.currentProgramSceneName,
    preview: list.currentPreviewSceneName, studio: mode.studioModeEnabled, scenes};
}
