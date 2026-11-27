# Live Agent

Prototipo 0.1 para **Windows**. Panel acoplable para consultar escenas de OBS, preparar escenas existentes en previo y mostrar u ocultar fuentes en escenas aisladas de Programa.

## Arranque en Windows

1. Instala Node.js 24. Ejecuta `start-windows.cmd` y deja la ventana abierta.
2. En OBS, activa el servidor WebSocket en **Herramientas → Ajustes del servidor WebSocket**. Utiliza el puerto 4455 y activa la contraseña.
3. En **Paneles → Paneles de navegador personalizados**, añade **Live Agent** con la URL `http://127.0.0.1:47831/`. También puedes abrir esa URL en un navegador.
4. Introduce la contraseña de OBS y pulsa **Leer escenas**. Para el chat, introduce una clave de la API de OpenAI con acceso a GPT-4.1 mini. La API se factura por separado.
5. Activa **Modo Estudio**. Prueba «Pon la escena Entrevista en previo», revisa la propuesta y pulsa **Aplicar propuesta**.

Las credenciales se conservan en los campos del panel durante la sesión. El servidor escucha solo en la interfaz local. Para una consulta el modelo recibe el texto y el inventario de OBS, incluidos los nombres de escenas y fuentes.

Esta versión usa un panel de navegador local, no un binario nativo. OAuth con ChatGPT, creación de escenas, inspección visual y recetas forman parte del [plan de desarrollo](docs/development.md). Prueba los cambios sobre una colección de ensayo antes de utilizarlos en directo.
