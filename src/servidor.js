import express from 'express';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const app = express();
const puerto = Number(process.env.PORT || 3027);
const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'mesa_solicitudes',
  user: process.env.PGUSER || 'solicitudes',
  password: process.env.PGPASSWORD || 'solicitudes_local',
  connectionTimeoutMillis: 3000,
  query_timeout: 4000,
  max: 5,
});

pool.on('error', (error) => {
  console.error(JSON.stringify({ evento: 'conexion_inactiva', codigo: error.code || 'SIN_CODIGO' }));
});

app.disable('x-powered-by');
app.use((req, res, next) => {
  req.id = randomUUID();
  res.set({
    'X-Peticion-Id': req.id,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  });
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '16kb', strict: true }));

function responderError(req, res, estado, codigo, titulo, mensaje, accion, campos) {
  return res.status(estado).json({
    ok: false,
    error: { codigo, titulo, mensaje, accion, ...(campos ? { campos } : {}) },
    peticion: req.id,
  });
}

function validarSolicitud(body) {
  const reglas = {
    nombre: { min: 2, max: 80, etiqueta: 'El nombre' },
    asunto: { min: 4, max: 120, etiqueta: 'El asunto' },
    mensaje: { min: 10, max: 2000, etiqueta: 'El mensaje' },
  };
  const campos = {};
  const datos = {};
  for (const [clave, regla] of Object.entries(reglas)) {
    const valor = typeof body?.[clave] === 'string' ? body[clave].trim() : '';
    if ([...valor].length < regla.min || [...valor].length > regla.max || /\u0000/.test(valor)) {
      campos[clave] = `${regla.etiqueta} debe tener entre ${regla.min} y ${regla.max} caracteres.`;
    }
    datos[clave] = valor;
  }
  return { datos, campos };
}

const columnas = 'id, nombre, asunto, mensaje, estado, creada_en';

app.get('/api/salud', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, datos: { servicio: 'disponible', baseDeDatos: 'PostgreSQL' }, peticion: req.id });
});

app.get('/api/solicitudes', async (req, res) => {
  const resultado = await pool.query(`SELECT ${columnas} FROM solicitudes ORDER BY id DESC LIMIT 8`);
  res.json({ ok: true, datos: resultado.rows, peticion: req.id });
});

app.get('/api/solicitudes/:id', async (req, res) => {
  if (!/^[1-9]\d{0,9}$/.test(req.params.id) || Number(req.params.id) > 2147483647) {
    return responderError(req, res, 400, 'ID_INVALIDO', 'Revisa el número de solicitud',
      'El número debe ser un entero positivo, por ejemplo 1.', 'Escribe un número válido e inténtalo otra vez.');
  }
  const resultado = await pool.query(`SELECT ${columnas} FROM solicitudes WHERE id = $1`, [Number(req.params.id)]);
  if (!resultado.rowCount) {
    return responderError(req, res, 404, 'SOLICITUD_NO_ENCONTRADA', 'No encontramos esta solicitud',
      `No existe una solicitud con el número ${req.params.id}. Tus demás solicitudes siguen disponibles.`,
      'Revisa el número o consulta una solicitud reciente.');
  }
  res.json({ ok: true, datos: resultado.rows[0], peticion: req.id });
});

app.post('/api/solicitudes', async (req, res) => {
  const { datos, campos } = validarSolicitud(req.body);
  if (Object.keys(campos).length) {
    return responderError(req, res, 400, 'DATOS_INVALIDOS', 'Faltan algunos detalles',
      'Revisa los campos indicados. Conservamos lo que escribiste para que puedas corregirlo.',
      'Completa los datos y vuelve a enviar.', campos);
  }
  const resultado = await pool.query(
    `INSERT INTO solicitudes (nombre, asunto, mensaje) VALUES ($1, $2, $3) RETURNING ${columnas}`,
    [datos.nombre, datos.asunto, datos.mensaje],
  );
  res.status(201).location(`/api/solicitudes/${resultado.rows[0].id}`)
    .json({ ok: true, datos: resultado.rows[0], peticion: req.id });
});

app.post('/api/ensayos/500', async (req, res) => {
  const cliente = await pool.connect();
  let transaccionAbierta = false;
  let clienteLiberado = false;
  try {
    await cliente.query('BEGIN');
    transaccionAbierta = true;
    await cliente.query('SELECT 1 / 0 AS ensayo');
    await cliente.query('COMMIT');
    transaccionAbierta = false;
    throw new Error('El ensayo no produjo el error esperado');
  } catch (error) {
    if (transaccionAbierta) {
      try { await cliente.query('ROLLBACK'); }
      catch (errorReversion) { cliente.release(errorReversion); clienteLiberado = true; throw errorReversion; }
    }
    if (error.code !== '22012') throw error;
    return responderError(req, res, 500, 'ENSAYO_CONTROLADO', 'Algo no salió como esperábamos',
      'Este es un ensayo controlado de un error interno. No se modificaron tus solicitudes.',
      'Comprueba la recuperación para volver a una respuesta correcta.');
  } finally {
    if (!clienteLiberado) cliente.release();
  }
});

app.use('/api', (req, res) => responderError(req, res, 404, 'RUTA_NO_ENCONTRADA',
  'Esta dirección no existe', 'No encontramos el recurso que solicitaste.', 'Vuelve a la mesa de solicitudes.'));

app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
app.use((req, res) => res.status(404).type('text').send('Página no encontrada. Abre la página principal.'));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return responderError(req, res, 400, 'JSON_INVALIDO', 'No pudimos leer los datos',
      'El contenido enviado no tiene un formato JSON válido.', 'Corrige el formato y vuelve a intentar.');
  }
  if (error.type === 'entity.too.large') {
    return responderError(req, res, 413, 'CONTENIDO_EXTENSO', 'El contenido es demasiado extenso',
      'La solicitud supera el tamaño permitido.', 'Reduce el mensaje e inténtalo otra vez.');
  }
  console.error(JSON.stringify({ evento: 'error_peticion', peticion: req.id, codigo: error.code || 'INTERNO' }));
  const noDisponible = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', '57P01', '57P02', '57P03', '53300', '08006'].includes(error.code)
    || /timeout|connection terminated|Connection terminated/i.test(error.message || '');
  if (noDisponible) {
    return responderError(req, res, 503, 'BASE_NO_DISPONIBLE', 'Estamos recuperando la conexión',
      'La base de datos no está disponible en este momento. Tus datos guardados se conservan.',
      'Espera unos segundos y vuelve a intentar.');
  }
  return responderError(req, res, 500, 'ERROR_INTERNO', 'No pudimos completar la operación',
    'Ocurrió un problema interno. No es necesario que cambies tus datos.', 'Vuelve a intentar en unos segundos.');
});

const servidor = app.listen(puerto, '0.0.0.0', () => console.log(`Mesa de solicitudes disponible en el puerto ${puerto}`));
async function cerrar() {
  servidor.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
