Prelanzamiento para **Windows x64** y **OBS Studio 33**. El instalador incluye el runtime Node.js y no requiere privilegios de administrador. OBS se instala por separado.

Inicia Live Agent desde el menú Inicio. En OBS, activa WebSocket en el puerto 4455 y añade un panel de navegador personalizado con la URL http://127.0.0.1:47831/. Conecta tu cuenta desde el panel con **Continuar con ChatGPT**.

El instalador no está firmado. El flujo de CI comprueba la instalación y el arranque del panel en Windows. La conexión con OBS 33 y la autorización con una cuenta real de ChatGPT requieren una prueba manual.
