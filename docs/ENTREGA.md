# Guía de entrega · Reto 27

**Integrantes: Sebastián y Santiago.**

## Qué se entrega

Una mesa de solicitudes con creación y consulta persistente en PostgreSQL, una interfaz adaptable y escenarios que muestran el manejo visual de los estados HTTP. El repositorio contiene código fuente, contenedores, automatización de inicio, SQL, pruebas y documentación.

| Entregable pedido | Ubicación | Cómo comprobarlo |
| --- | --- | --- |
| Contenedor o automatización | `Dockerfile`, `compose.yaml` | `docker compose up --build -d --wait` |
| Interfaz integrada y adaptable | `public/` y `src/servidor.js` | Abrir `http://localhost:3027`, crear y consultar |
| Makefile | `Makefile` | `make iniciar` y `make probar` |
| README con evidencia | `README.md`, `docs/evidencias/pruebas.txt` | Repetir `docker compose exec -T app npm test` |
| Base PostgreSQL | `db/001-esquema.sql`, volumen de Compose | Crear un registro, reiniciar y consultarlo |

## Antes de presentar

1. Abre Docker Desktop o inicia el servicio Docker.
2. En la carpeta del repositorio, ejecuta `docker compose up --build -d --wait`.
3. Confirma ambos servicios en estado saludable con `docker compose ps`.
4. Ejecuta `docker compose exec -T app npm test`.
5. Abre `http://localhost:3027`.

## Guion de demostración, entre tres y cinco minutos

1. **Consulta correcta, 200.** Selecciona Todo en orden y consulta el número 1. Explica que el servidor consulta PostgreSQL y devuelve datos reales.
2. **Datos inválidos, 400.** Selecciona Faltan datos y envía. Muestra la explicación, los campos por corregir y la acción recomendada. La validación ocurre en el servidor.
3. **Recurso ausente, 404.** Selecciona No encontrada y busca el ID propuesto. Explica la diferencia entre un número que no existe y una caída del servidor.
4. **Error interno, 500.** Selecciona Error interno · Ensayo. Explica que es una operación de demostración: PostgreSQL ejecuta una consulta que falla, el servidor revierte la transacción y devuelve un error seguro. No se modifican solicitudes.
5. **Recuperación, 200.** Pulsa Comprobar recuperación. La misma aplicación vuelve a consultar correctamente, sin recargar la página.
6. **Nueva solicitud, 201.** Completa el formulario, guarda y muestra el número creado. Consúltalo en la lista inferior.
7. **Evidencia.** Abre los detalles de una petición y el historial. Muestra las pruebas ejecutadas. Ajusta el ancho de la ventana para demostrar la vista móvil.

Los integrantes pueden repartirse libremente la presentación.

## Qué explicar del funcionamiento

El navegador hace peticiones con Fetch a un servidor Node.js. Express valida los datos y `pg` ejecuta consultas parametrizadas a PostgreSQL. Los registros permanecen en un volumen Docker. La interfaz interpreta el estado HTTP y muestra una explicación y una acción, sin perder los datos del formulario.

El ensayo 500 usa `BEGIN`, una operación fallida y `ROLLBACK`; después libera el cliente del pool. Los fallos de conexión reales se traducen a 503. Si no se recibe respuesta HTTP, la interfaz presenta un estado de conexión con texto propio, sin inventar un código.

Los detalles de la petición son plegables para mantener el mensaje principal sencillo. La información técnica que ve el usuario no incluye errores SQL, credenciales ni trazas internas.

## Pruebas y límites

La evidencia automatizada se guarda en [evidencias/pruebas.txt](evidencias/pruebas.txt). La suite usa HTTP y PostgreSQL reales, sin sustituir la base por memoria. Incluye inserción, lectura, errores 400/404/500, recuperación, JSON inválido, consultas parametrizadas y manejo literal de HTML.

Las pruebas funcionales verifican el contrato HTTP y la persistencia. La adaptación visual y la navegación con teclado se revisan desde el navegador. Esta entrega permite crear y consultar solicitudes; los estados de las semillas son datos de ejemplo, sin un flujo de edición de estado.

Para repetir los resultados en otra máquina, basta descargar el repositorio, iniciar los contenedores y ejecutar las pruebas como se indica en el README. No se incluye una base de datos con información personal de los integrantes.
