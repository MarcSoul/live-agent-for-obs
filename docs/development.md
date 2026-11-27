# Desarrollo

## Arquitectura

- Dock nativo de OBS con chat, propuesta de cambios, resultados y recetas.
- Proceso local para OAuth, credenciales del sistema y llamadas a Responses. Validar Sign in with ChatGPT con una cuenta Plus elegible.
- Adaptador obs-websocket para inventario, eventos y operaciones. Usar la API interna de OBS donde el dock o una función lo requieran.
- El modelo propone acciones tipadas. El motor local resuelve identificadores, valida el contexto, aplica cambios y vuelve a leer el estado. Las reglas y temporizadores se ejecutan localmente.

## Backlog

1. **OBS local.** Enumerar escenas, fuentes y grupos. Identificar Programa y Previo, y detectar cambios de colección.
2. **OAuth.** Verificar inicio de sesión, renovación, llamada a una función local e inspección de una captura. Documentar errores de acceso y cuota.
3. **Montaje.** Crear escenas, reutilizar cámaras, ajustar encuadres, visibilidad y rótulos. Preparar en previo y registrar los cambios que se puedan deshacer.
4. **Chequeo.** Verificar imagen de tres cámaras y presencia de señal de mesa. Diferenciar mediciones y diagnósticos probables.
5. **Recetas.** Guardar alias por colección y repetir el montaje. El operador decide cuándo pasar a Programa.
6. **Realización.** Empezar en modo sugerencia, registrar qué cortes acepta el operador y probar el control automático con prioridad manual.

## Prueba de aceptación

Con una colección de prueba de tres cámaras, solicitar un montaje de entrevista, inspeccionarlo en previo y repetirlo desde una receta. Comprobar que Programa conserva sus fuentes y propiedades, incluso si se comparten con el previo. Ante cambios manuales o pérdida de conexión, comprobar que no se aplican acciones pendientes sobre un estado obsoleto.

Referencias: [OBS Frontend API](https://docs.obsproject.com/reference-frontend-api), [obs-websocket](https://github.com/obsproject/obs-websocket) y [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source).
