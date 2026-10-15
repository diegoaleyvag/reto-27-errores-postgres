# Mesa de solicitudes · Reto 27

**Integrantes: Sebastián y Santiago.**

Interfaz adaptable que convierte respuestas HTTP reales en mensajes claros y acciones de recuperación. Las solicitudes se crean y consultan en **PostgreSQL 17**; el navegador usa Fetch sin recargar la página. Incluye escenarios 200, 400, 404 y 500, además de tratamiento de indisponibilidad de la base de datos (503) y fallos de red.

## Inicio en Windows, macOS y Linux

Necesitas Docker con Docker Compose. En Windows y macOS, abre Docker Desktop antes de continuar; en Windows usa contenedores Linux. No necesitas instalar Node.js, PostgreSQL ni Make en tu equipo.

1. Descarga este repositorio desde **Code → Download ZIP** y descomprímelo, o clónalo con Git.
2. Abre una terminal dentro de la carpeta que contiene `compose.yaml`.
3. Ejecuta:

```sh
docker compose up --build -d --wait
```

4. Abre [http://localhost:3027](http://localhost:3027).

El mismo comando funciona en PowerShell, Terminal y una terminal de Linux. La primera ejecución descarga las imágenes y puede tardar unos minutos. No hay que crear ni editar `.env`. Cada integrante ejecuta su propia copia y tiene una base de datos independiente.

Si el puerto está ocupado, crea un archivo `.env` con `APP_PORT=3127` e inicia de nuevo. Abre entonces `http://localhost:3127`. `.env.example` documenta todos los valores locales predeterminados.

## Comandos de uso

| Acción | Sin Make, en cualquier sistema | Con Make |
| --- | --- | --- |
| Iniciar y esperar servicios listos | `docker compose up --build -d --wait` | `make iniciar` |
| Ver estado | `docker compose ps` | `make estado` |
| Ver registros | `docker compose logs -f --tail=100` | `make registros` |
| Ejecutar pruebas de integración | `docker compose exec -T app npm test` | `make probar` |
| Verificar sintaxis | `docker compose exec -T app npm run verificar` | `make verificar` |
| Detener, conservando los datos | `docker compose down` | `make detener` |

Las pruebas requieren los servicios iniciados. Para salir de los registros, usa Ctrl+C; la aplicación permanece en marcha.

## Demostración rápida

1. En **Todo en orden**, consulta el número `1`: recibirás **200** y la solicitud guardada.
2. Selecciona **Faltan datos** y envía: el backend valida campos vacíos y responde **400**, con mensajes por campo.
3. Selecciona **No encontrada** y busca: el número `2147483647` produce **404** en una base inicial.
4. Selecciona **Error interno · Ensayo** y ejecuta: PostgreSQL ejecuta una consulta fallida, la API la captura y devuelve **500** con una explicación amigable.
5. Pulsa **Comprobar recuperación**: recibirás **200** de nuevo. La transacción del ensayo se revierte con `ROLLBACK` y se libera la conexión.
6. En **Nueva solicitud**, completa nombre, asunto y mensaje. Recibirás **201** y un número nuevo. Consulta ese número desde la lista inferior.
7. Abre **Ver detalles de la petición** para ver método, ruta, estado, identificador y JSON. El historial conserva las seis últimas peticiones de la sesión.

El ensayo 500 está identificado de forma explícita. Es un error HTTP real originado por una operación fallida de PostgreSQL, preparado para demostrar su manejo visual; no representa una caída real del servicio.

## Entregables y evidencia

| Requisito | Archivos o comportamiento |
| --- | --- |
| Contenedor funcional | `Dockerfile`, `compose.yaml`, healthchecks y arranque con espera |
| Interfaz web adaptable integrada | `public/`, creación y consulta con Fetch, estados de carga y recuperación |
| Makefile con inicio | `Makefile` y alternativas para Windows sin Make |
| Base de datos PostgreSQL | `db/001-esquema.sql`, esquema y tres solicitudes de ejemplo |
| Pruebas funcionales | `test/integracion.test.js`, HTTP real contra PostgreSQL |
| Evidencia de pruebas | [Salida de las pruebas ejecutadas](docs/evidencias/pruebas.txt) |
| Guion y explicación para entregar | [docs/ENTREGA.md](docs/ENTREGA.md) |
| Pruebas automáticas en GitHub | `.github/workflows/pruebas.yml` |

Resultado verificado el 15 de octubre de 2026: **14 pruebas aprobadas, 0 fallos** con los servicios Docker y PostgreSQL reales.

La suite comprueba disponibilidad, creación y lectura persistente, validación de datos y tipos, JSON incorrecto, identificadores inválidos, 404, ensayo 500, recuperación posterior a 200, consultas parametrizadas y contenido HTML literal. Solo elimina los registros creados por las propias pruebas.

## API

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/salud` | 200 si PostgreSQL responde; 503 si no está disponible |
| GET | `/api/solicitudes` | 200 con las ocho solicitudes más recientes |
| GET | `/api/solicitudes/:id` | 200, 400 por número inválido o 404 si no existe |
| POST | `/api/solicitudes` | 201 con la solicitud; 400 por datos inválidos |
| POST | `/api/ensayos/500` | 500 de ensayo controlado y recuperación posterior |

Cuerpo para crear:

```json
{
  "nombre": "Sebastián",
  "asunto": "Consulta sobre la entrega",
  "mensaje": "Quisiera confirmar el horario de presentación del proyecto."
}
```

Los espacios exteriores se eliminan. Nombre: entre 2 y 80 caracteres; asunto: entre 4 y 120; mensaje: entre 10 y 2000. Los campos deben ser texto y no contener caracteres nulos. El ID debe ser un entero entre 1 y 2147483647. Las respuestas de error comparten `ok: false`, `error` e identificador `peticion`, sin credenciales, consultas, rutas internas ni trazas.

## Persistencia y recuperación

El volumen `datos_postgres` conserva los datos aunque detengas los contenedores o reconstruyas la aplicación. PostgreSQL se comunica únicamente por la red de Compose, sin publicar el puerto de la base de datos en el equipo. El esquema y las semillas se cargan una sola vez al crear el volumen.

Para comprobar persistencia, crea una solicitud, anota su número, ejecuta `docker compose down` y vuelve a iniciar. Consulta el mismo número.

Para demostrar una indisponibilidad **real** de la base de datos:

```sh
docker compose stop db
```

Consulta una solicitud. La API responderá 503 y la UI ofrecerá reintentar. Para recuperar:

```sh
docker compose start db
docker compose up -d --wait
```

Pulsa **Comprobar recuperación**. Si detienes también la aplicación mientras la página está abierta, la UI mostrará **Sin red**, diferenciando la ausencia de respuesta de un código HTTP.

Si cambias las credenciales de `.env`, recuerda que un volumen existente conserva sus credenciales anteriores. Para restaurar las semillas desde cero, `docker compose down -v` elimina **todos los datos de esta aplicación**; luego vuelve a iniciar.

## Estructura y decisiones

- `src/servidor.js`: servidor Node.js 22, Express, validación, consultas parametrizadas y manejo central de errores.
- `public/`: HTML, CSS y JavaScript sin compilación ni recursos externos.
- `db/`: esquema, restricciones y semillas.
- `test/`: pruebas con `node:test`, solicitudes HTTP reales y limpieza de registros de prueba.
- `docs/`: guía de entrega y evidencia.

Los mensajes de error indican lo ocurrido y el siguiente paso. La interfaz conserva el formulario al fallar, mueve el foco a los resultados o al primer campo inválido, anuncia resultados con `aria-live`, admite navegación por teclado y respeta la preferencia de movimiento reducido. El contenido recibido se inserta como texto, nunca como HTML.

Las dependencias están fijadas en `package-lock.json`; el contenedor instala con `npm ci`. Para trabajar con Node.js local, usa Node.js 22 o superior y una instancia PostgreSQL inicializada con el SQL del repositorio. La vía lista para ejecutar y probar es Docker Compose.
