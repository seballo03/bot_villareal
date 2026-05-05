# 🏠 Bot de WhatsApp — Crédito Villarreal

Bot de solicitud de crédito que funciona directamente en WhatsApp usando tu número real.

## Despliegue en Render.com (gratis)

### Paso 1 — Crear cuenta en GitHub
1. Ve a github.com y crea una cuenta gratis
2. Crea un repositorio nuevo llamado `credito-villarreal-bot`
3. Sube todos estos archivos al repositorio

### Paso 2 — Conectar con Render
1. Ve a render.com y crea cuenta gratis (con tu cuenta de GitHub)
2. Clic en "New +" → "Web Service"
3. Conecta tu repositorio de GitHub
4. Render detectará automáticamente el `render.yaml`

### Paso 3 — Configurar variables de entorno en Render
En tu servicio de Render → "Environment" agrega:
- `ANTHROPIC_KEY` = tu API key de Anthropic
- `JSONBIN_KEY` = tu API key de JSONBin
- `HISTORY_BIN` = el ID del bin del historial de clientes
- `SITE_URL` = la URL de tu app en Render (ej: https://credito-villarreal-bot.onrender.com)

### Paso 4 — Escanear QR
1. Una vez desplegado, abre la URL de tu app en Render
2. Aparecerá un código QR
3. Abre WhatsApp en tu celular → Dispositivos vinculados → Vincular dispositivo
4. Escanea el QR
5. ¡El bot está listo!

## Variables de entorno requeridas
| Variable | Descripción |
|----------|-------------|
| ANTHROPIC_KEY | API key de Anthropic para verificación IA |
| JSONBIN_KEY | API key de JSONBin para guardar expedientes |
| HISTORY_BIN | ID del bin JSONBin para historial de clientes |
| SITE_URL | URL pública del servicio en Render |

## Estructura del proyecto
- `server.js` — Servidor principal + conexión WhatsApp
- `flow.js` — Flujo de conversación (máquina de estados)
- `ai.js` — Verificación de documentos con IA
- `storage.js` — Guardado de expedientes en JSONBin
- `config.js` — Configuración y constantes

## Comandos del bot
- `inicio` — Reiniciar la solicitud
- Los clientes responden con números (1, 2, 3...) para seleccionar opciones
- Envían fotos directamente para documentos

## Notas importantes
- El bot usa tu número de WhatsApp real (no oficial, pero ampliamente usado en México)
- La sesión se guarda en disco (Render tiene 1GB gratis)
- Se reconecta automáticamente si se desconecta
