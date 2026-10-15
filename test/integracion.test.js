import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3027}`;
const creadas = [];
const datosValidos = { nombre: 'Prueba funcional', asunto: 'Consulta de integración', mensaje: 'Mensaje de prueba para comprobar la persistencia real.' };

async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(base + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...opciones.headers },
    signal: AbortSignal.timeout(10000),
  });
  const cuerpo = await respuesta.json();
  assert.ok(respuesta.headers.get('x-peticion-id'));
  assert.equal(cuerpo.peticion, respuesta.headers.get('x-peticion-id'));
  return { respuesta, cuerpo };
}

async function crear(datos) {
  const resultado = await pedir('/api/solicitudes', { method: 'POST', body: JSON.stringify(datos) });
  if (resultado.respuesta.status === 201) creadas.push(resultado.cuerpo.datos.id);
  return resultado;
}

after(async () => {
  if (!creadas.length) return;
  const pool = new pg.Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'mesa_solicitudes',
    user: process.env.PGUSER || 'solicitudes',
    password: process.env.PGPASSWORD || 'solicitudes_local',
    connectionTimeoutMillis: 3000,
  });
  try { await pool.query('DELETE FROM solicitudes WHERE id = ANY($1::int[])', [creadas]); }
  finally { await pool.end(); }
});

test('200: PostgreSQL está disponible y la API no expone credenciales', async () => {
  const { respuesta, cuerpo } = await pedir('/api/salud');
  assert.equal(respuesta.status, 200);
  assert.equal(cuerpo.ok, true);
  assert.equal(cuerpo.datos.baseDeDatos, 'PostgreSQL');
  assert.equal(JSON.stringify(cuerpo).includes('password'), false);
});

test('201 y 200: crear y recuperar una solicitud con persistencia real', async () => {
  const { respuesta, cuerpo } = await crear(datosValidos);
  assert.equal(respuesta.status, 201);
  assert.equal(respuesta.headers.get('location'), `/api/solicitudes/${cuerpo.datos.id}`);
  const lectura = await pedir(`/api/solicitudes/${cuerpo.datos.id}`);
  assert.equal(lectura.respuesta.status, 200);
  for (const [campo, valor] of Object.entries(datosValidos)) assert.equal(lectura.cuerpo.datos[campo], valor);
  assert.equal(lectura.cuerpo.datos.estado, 'Recibida');
  assert.ok(!Number.isNaN(Date.parse(lectura.cuerpo.datos.creada_en)));
});

test('200: la lista de solicitudes procede de la base de datos', async () => {
  const { respuesta, cuerpo } = await pedir('/api/solicitudes');
  assert.equal(respuesta.status, 200);
  assert.ok(Array.isArray(cuerpo.datos));
  assert.ok(cuerpo.datos.length > 0);
  assert.ok(cuerpo.datos.length <= 8);
  assert.ok(cuerpo.datos[0].id);
});

test('400: campos vacíos generan mensajes por campo', async () => {
  const { respuesta, cuerpo } = await crear({ nombre: '', asunto: '', mensaje: '' });
  assert.equal(respuesta.status, 400);
  assert.equal(cuerpo.error.codigo, 'DATOS_INVALIDOS');
  assert.deepEqual(Object.keys(cuerpo.error.campos).sort(), ['asunto', 'mensaje', 'nombre']);
  assert.ok(cuerpo.error.accion);
});

test('400: tipos incorrectos y textos demasiado largos se rechazan', async () => {
  for (const datos of [{ ...datosValidos, nombre: [] }, { ...datosValidos, mensaje: 'a'.repeat(2001) }, { ...datosValidos, asunto: 'abc\u0000def' }]) {
    const { respuesta } = await crear(datos);
    assert.equal(respuesta.status, 400);
  }
});

test('400: JSON mal formado devuelve un error seguro', async () => {
  const { respuesta, cuerpo } = await pedir('/api/solicitudes', { method: 'POST', body: '{"nombre":' });
  assert.equal(respuesta.status, 400);
  assert.equal(cuerpo.error.codigo, 'JSON_INVALIDO');
  assert.equal(JSON.stringify(cuerpo).includes('SyntaxError'), false);
});

test('400: identificadores inválidos no llegan a la consulta SQL', async () => {
  for (const id of ['0', '-1', 'abc', '1.5', '2147483648', '1%20OR%201=1']) {
    const { respuesta, cuerpo } = await pedir(`/api/solicitudes/${id}`);
    assert.equal(respuesta.status, 400);
    assert.equal(cuerpo.error.codigo, 'ID_INVALIDO');
  }
});

test('404: un número inexistente tiene una respuesta amable', async () => {
  const { respuesta, cuerpo } = await pedir('/api/solicitudes/2147483647');
  assert.equal(respuesta.status, 404);
  assert.equal(cuerpo.error.codigo, 'SOLICITUD_NO_ENCONTRADA');
  assert.ok(cuerpo.error.mensaje.includes('2147483647'));
  assert.ok(cuerpo.error.accion);
});

test('500: el ensayo ejecuta un fallo real de PostgreSQL sin exponer detalles', async () => {
  const { respuesta, cuerpo } = await pedir('/api/ensayos/500', { method: 'POST' });
  assert.equal(respuesta.status, 500);
  assert.equal(cuerpo.error.codigo, 'ENSAYO_CONTROLADO');
  assert.match(cuerpo.error.mensaje, /ensayo controlado/i);
  assert.equal(/division|22012|SELECT|stack|servidor\.js/i.test(JSON.stringify(cuerpo)), false);
});

test('200 posterior al 500: la conexión se recupera tras ROLLBACK', async () => {
  await pedir('/api/ensayos/500', { method: 'POST' });
  const { respuesta, cuerpo } = await pedir('/api/salud');
  assert.equal(respuesta.status, 200);
  assert.equal(cuerpo.ok, true);
  const escritura = await crear({ ...datosValidos, asunto: 'Después del ensayo' });
  assert.equal(escritura.respuesta.status, 201);
});

test('las consultas parametrizadas conservan una inyección como texto literal', async () => {
  const literal = "Prueba'); DROP TABLE solicitudes; --";
  const { respuesta, cuerpo } = await crear({ ...datosValidos, asunto: literal });
  assert.equal(respuesta.status, 201);
  const lectura = await pedir(`/api/solicitudes/${cuerpo.datos.id}`);
  assert.equal(lectura.cuerpo.datos.asunto, literal);
  const lista = await pedir('/api/solicitudes');
  assert.equal(lista.respuesta.status, 200);
});

test('el contenido HTML se conserva como texto y no se interpreta en la API', async () => {
  const literal = '<img src=x onerror=alert(1)> Este contenido es texto.';
  const { respuesta, cuerpo } = await crear({ ...datosValidos, mensaje: literal });
  assert.equal(respuesta.status, 201);
  const lectura = await pedir(`/api/solicitudes/${cuerpo.datos.id}`);
  assert.equal(lectura.cuerpo.datos.mensaje, literal);
  assert.match(lectura.respuesta.headers.get('content-type'), /application\/json/);
});

test('404: una ruta de API desconocida mantiene el contrato JSON', async () => {
  const { respuesta, cuerpo } = await pedir('/api/no-existe');
  assert.equal(respuesta.status, 404);
  assert.equal(cuerpo.error.codigo, 'RUTA_NO_ENCONTRADA');
});

test('la interfaz se sirve localmente con política de recursos del mismo origen', async () => {
  const respuesta = await fetch(base);
  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await respuesta.text(), /<html lang="es">/);
});
