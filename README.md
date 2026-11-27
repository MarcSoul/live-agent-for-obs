# Live Agent

Versión preliminar 0.3 para **Windows**. Panel acoplable para crear y preparar escenas, añadir cámaras y audio ya configurados, dar de alta rótulos, fondos de color e imágenes y editar su posición, escala y visibilidad.

## Arranque en Windows

1. Instala Node.js 24. Ejecuta `start-windows.cmd` y deja la ventana abierta.
2. En OBS, activa el servidor WebSocket en **Herramientas → Ajustes del servidor WebSocket**. Utiliza el puerto 4455 y activa la contraseña.
3. En **Paneles → Paneles de navegador personalizados**, añade **Live Agent** con la URL `http://127.0.0.1:47831/`. También puedes abrir esa URL en un navegador.
4. Introduce la contraseña de OBS y pulsa **Leer escenas**. Pulsa **Continuar con ChatGPT** y autoriza el uso de tu plan en el navegador predeterminado. Vuelve al panel de OBS para chatear.
5. Activa **Modo Estudio**. Prueba «Pon la escena Entrevista en previo», revisa la propuesta y pulsa **Aplicar propuesta**.

## Comandos del chat

- `/model` lista los modelos de tu cuenta. `/model <id>` selecciona uno.
- `/reasoning` muestra el ajuste activo. `/reasoning high` solicita razonamiento alto y `/reasoning default` devuelve el control al modelo. Los niveles admitidos dependen del modelo.

Live Agent conecta mediante [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source) para cuentas y proyectos elegibles. La sesión y los ajustes duran mientras el proceso local siga abierto. Las credenciales de ChatGPT se mantienen en memoria en el servidor local. El modelo recibe la conversación reciente y el inventario de OBS en cada consulta.

La inspección visual y las recetas forman parte del [plan de desarrollo](docs/development.md). Prueba los cambios sobre una colección de ensayo antes de utilizarlos en directo.

Ejemplo: «Crea Entrevista, añade Cámara 1, crea un rótulo Invitado con el texto Marc, muévelo a x=100 e y=800 y deja Entrevista en previo». Revisa la lista antes de aplicar. Si un paso falla, los cambios ya aplicados se conservan.

**Revisar previo con imagen** captura la escena en Previo y la envía a ChatGPT junto con la petición. Usa un modelo con visión y activa el Modo Estudio. Tras aplicar un montaje, puedes escribir «Corrige los solapes y deja el rótulo dentro del lienzo» y pulsar ese botón. Revisa y aplica cualquier corrección propuesta desde el panel.

Con **Visión automática del previo** activada, una consulta normal incluye el fotograma si hay una escena en Previo. Tras aplicar un plan, el panel vuelve a capturar el previo y muestra posibles correcciones. El operador decide si las aplica. Sin previo, la consulta normal funciona con el inventario de OBS.
