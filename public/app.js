const $ = (selector) => document.querySelector(selector);
const escenarios = {
  correcta: { boton: 'Consultar solicitud', numero: '1', nota: '', ruta: () => `/api/solicitudes/${encodeURIComponent($('#numero').value.trim() || '0')}`, metodo: 'GET' },
  invalida: { boton: 'Enviar datos incompletos', nota: 'Enviaremos campos vacíos al servidor. La validación del backend devolverá una respuesta 400 con los campos que debes corregir.', ruta: () => '/api/solicitudes', metodo: 'POST', cuerpo: { nombre: '', asunto: '', mensaje: '' } },
  ausente: { boton: 'Buscar solicitud', numero: '2147483647', nota: '', ruta: () => `/api/solicitudes/${encodeURIComponent($('#numero').value.trim() || '0')}`, metodo: 'GET' },
  interno: { boton: 'Ejecutar ensayo controlado', nota: 'Este ensayo ejecuta una consulta fallida en PostgreSQL y revierte la transacción. Devuelve un 500 real sin alterar tus solicitudes ni simular una caída del servicio.', ruta: () => '/api/ensayos/500', metodo: 'POST' },
};
let escenarioActual = 'correcta';
let ultimoId = 1;
let ocupada = false;
let listaOcupada = false;
const historial = [];
const formatoFecha = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
const formatoHora = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function seleccionarEscenario(clave) {
  escenarioActual = clave;
  const escenario = escenarios[clave];
  document.querySelectorAll('[data-escenario]').forEach((boton) => {
    const activo = boton.dataset.escenario === clave;
    boton.classList.toggle('seleccionado', activo);
    boton.setAttribute('aria-pressed', String(activo));
  });
  $('#grupo-numero').hidden = !escenario.numero;
  if (escenario.numero) $('#numero').value = clave === 'correcta' ? String(ultimoId) : escenario.numero;
  $('#nota-escenario').textContent = escenario.nota;
  $('#nota-escenario').hidden = !escenario.nota;
  $('#enviar-escenario').replaceChildren(document.createTextNode(escenario.boton + ' '));
  const flecha = document.createElement('span');
  flecha.textContent = '↗'; flecha.setAttribute('aria-hidden', 'true');
  $('#enviar-escenario').append(flecha);
}

function cambiarPestana(crear, enfocar = false) {
  for (const [nombre, activa] of [['crear', crear], ['escenarios', !crear]]) {
    const tab = $(`#tab-${nombre}`);
    tab.classList.toggle('activa', activa);
    tab.setAttribute('aria-selected', String(activa));
    tab.tabIndex = activa ? 0 : -1;
    $(`#panel-${nombre}`).hidden = !activa;
    if (activa && enfocar) tab.focus();
  }
}

function establecerCarga(valor) {
  ocupada = valor;
  $('#resultado').setAttribute('aria-busy', String(valor));
  document.querySelectorAll('#form-escenario button, #form-crear button, [data-escenario], #recuperar, .enlace-consultar').forEach((boton) => { boton.disabled = valor; });
  if (valor) {
    $('#tipo-respuesta').textContent = 'Enviando…';
    $('#titulo-respuesta').textContent = 'Estamos consultando…';
    $('#mensaje-respuesta').textContent = 'Espera un momento mientras el servidor responde.';
  }
}

async function consultar(ruta, metodo = 'GET', cuerpo) {
  const respuesta = await fetch(ruta, {
    method: metodo,
    headers: { Accept: 'application/json', ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  let datos;
  try { datos = await respuesta.json(); }
  catch { datos = { ok: false, error: { titulo: 'La respuesta no se pudo leer', mensaje: 'El servidor envió una respuesta inesperada.', accion: 'Vuelve a intentar en unos segundos.' } }; }
  return { estado: respuesta.status, datos };
}

function mostrarResultado(estado, datos, ruta, metodo, duracion) {
  const exito = estado >= 200 && estado < 300 && datos.ok;
  const error = datos.error || {};
  const categoria = exito ? 'exito' : estado === 400 ? 'validacion' : estado === 404 ? 'ausente' : 'error';
  $('#resultado').dataset.estado = categoria;
  $('#codigo-respuesta').textContent = estado || 'Sin red';
  $('#codigo-respuesta').style.fontSize = estado ? '' : '58px';
  $('#tipo-respuesta').textContent = exito ? 'Operación correcta' : estado === 500 && error.codigo === 'ENSAYO_CONTROLADO' ? 'Ensayo controlado' : estado === 400 ? 'Revisa los datos' : estado === 404 ? 'No encontrada' : estado === 503 ? 'Servicio no disponible' : estado === 0 ? 'Sin conexión' : 'Error del servidor';
  $('#titulo-respuesta').textContent = exito ? estado === 201 ? 'Tu solicitud ya está guardada.' : 'Aquí está tu solicitud.' : error.titulo || 'No pudimos completar la operación';
  $('#mensaje-respuesta').textContent = exito ? estado === 201 ? 'La recibimos correctamente. Conserva su número para consultarla cuando quieras.' : 'El servidor encontró el registro y lo recuperó desde PostgreSQL.' : error.mensaje || 'Ocurrió un problema inesperado.';
  $('#datos-solicitud').hidden = !exito;
  if (exito && datos.datos?.id) {
    const solicitud = datos.datos;
    ultimoId = solicitud.id;
    $('#solicitud-numero').textContent = `SOLICITUD #${solicitud.id}`;
    $('#solicitud-estado').textContent = solicitud.estado;
    $('#solicitud-asunto').textContent = solicitud.asunto;
    $('#solicitud-mensaje').textContent = solicitud.mensaje;
    $('#solicitud-persona').textContent = `${solicitud.nombre} · ${formatoFecha.format(new Date(solicitud.creada_en))}`;
  }
  $('#errores-campos').replaceChildren();
  const campos = Object.values(error.campos || {});
  $('#errores-campos').hidden = !campos.length;
  campos.forEach((mensaje) => { const li = document.createElement('li'); li.textContent = mensaje; $('#errores-campos').append(li); });
  $('#siguiente-paso').hidden = exito;
  $('#accion-respuesta').textContent = error.accion || 'Vuelve a intentar en unos segundos.';
  $('#recuperar').hidden = exito;
  $('#detalles').hidden = false;
  $('#detalle-ruta').textContent = `${metodo} ${ruta}`;
  $('#detalle-estado').textContent = estado ? String(estado) : 'No hubo respuesta HTTP';
  $('#detalle-id').textContent = datos.peticion || 'Sin identificador';
  $('#detalle-json').textContent = JSON.stringify(datos, null, 2);
  $('#duracion').textContent = `${duracion} ms`;
}

function registrar(estado, metodo, ruta, duracion) {
  historial.unshift({ estado, metodo, ruta, duracion, hora: new Date() });
  historial.splice(6);
  dibujarHistorial();
}

function dibujarHistorial() {
  const lista = $('#lista-historial');
  lista.replaceChildren();
  if (!historial.length) { const li = document.createElement('li'); li.className = 'historial-vacio'; li.textContent = 'Las peticiones que envíes aparecerán aquí.'; lista.append(li); }
  historial.forEach((entrada) => {
    const li = document.createElement('li');
    const codigo = document.createElement('span'); codigo.className = 'codigo-historial' + (entrada.estado >= 400 || !entrada.estado ? ' fallo' : ''); codigo.textContent = entrada.estado || 'Red';
    const ruta = document.createElement('span'); ruta.className = 'ruta-historial'; ruta.textContent = `${entrada.metodo} ${entrada.ruta}`; ruta.title = ruta.textContent;
    const hora = document.createElement('time'); hora.dateTime = entrada.hora.toISOString(); hora.className = 'tiempo-historial'; hora.textContent = formatoHora.format(entrada.hora);
    li.append(codigo, ruta, hora); lista.append(li);
  });
}

async function enviar(ruta, metodo = 'GET', cuerpo) {
  if (ocupada) return;
  establecerCarga(true);
  const inicio = performance.now();
  let resultado;
  try {
    resultado = await consultar(ruta, metodo, cuerpo);
  } catch {
    resultado = { estado: 0, datos: { ok: false, error: { codigo: 'SIN_CONEXION', titulo: 'No pudimos conectar contigo', mensaje: 'La petición no recibió respuesta. Revisa tu conexión o comprueba que la aplicación esté en marcha.', accion: metodo === 'POST' && ruta === '/api/solicitudes' ? 'Consulta primero las solicitudes recientes: si el envío llegó al servidor, tu solicitud podría haberse guardado.' : 'Comprueba la conexión y vuelve a intentar.' } } };
  }
  const duracion = Math.round(performance.now() - inicio);
  establecerCarga(false);
  mostrarResultado(resultado.estado, resultado.datos, ruta, metodo, duracion);
  registrar(resultado.estado, metodo, ruta, duracion);
  $('#titulo-respuesta').focus({ preventScroll: true });
  if (matchMedia('(max-width: 680px)').matches) $('#resultado').scrollIntoView({ behavior: 'auto', block: 'start' });
  if (resultado.estado === 201) void actualizarRecientes();
  void comprobarConexion();
  return resultado;
}

async function comprobarConexion() {
  try {
    const { estado } = await consultar('/api/salud');
    $('#punto-conexion').className = `punto ${estado === 200 ? 'disponible' : 'error'}`;
    $('#estado-conexion').textContent = estado === 200 ? 'Conexión disponible' : 'Conexión no disponible';
  } catch {
    $('#punto-conexion').className = 'punto error'; $('#estado-conexion').textContent = 'Sin conexión al servidor';
  }
}

async function actualizarRecientes() {
  if (listaOcupada) return;
  listaOcupada = true;
  $('#actualizar').disabled = true;
  $('#estado-recientes').textContent = 'Consultando PostgreSQL…';
  try {
    const { estado, datos } = await consultar('/api/solicitudes');
    if (estado !== 200 || !Array.isArray(datos.datos)) throw new Error('No disponible');
    $('#lista-recientes').replaceChildren();
    $('#estado-recientes').textContent = datos.datos.length ? `${datos.datos.length} solicitudes más recientes. Consulta cualquiera por su número.` : 'Todavía no hay solicitudes. Crea la primera desde Nueva solicitud.';
    datos.datos.forEach((solicitud) => {
      const fila = document.createElement('tr');
      for (const valor of [`#${solicitud.id}`, solicitud.asunto, solicitud.nombre]) { const td = document.createElement('td'); td.textContent = valor; fila.append(td); }
      const tdEstado = document.createElement('td'); const estado = document.createElement('span'); estado.className = `pill-estado ${solicitud.estado === 'Resuelta' ? 'resuelta' : solicitud.estado === 'En revisión' ? 'revision' : ''}`; estado.textContent = solicitud.estado; tdEstado.append(estado);
      const tdAccion = document.createElement('td'); const boton = document.createElement('button'); boton.type = 'button'; boton.className = 'enlace-consultar'; boton.textContent = 'Consultar ↗'; boton.setAttribute('aria-label', `Consultar solicitud ${solicitud.id}: ${solicitud.asunto}`); boton.disabled = ocupada; boton.addEventListener('click', () => { cambiarPestana(false); seleccionarEscenario('correcta'); $('#numero').value = String(solicitud.id); void enviar(`/api/solicitudes/${solicitud.id}`); }); tdAccion.append(boton); fila.append(tdEstado, tdAccion); $('#lista-recientes').append(fila);
    });
  } catch {
    $('#estado-recientes').textContent = 'No pudimos actualizar la lista. Puedes reintentar con Actualizar. Los datos guardados se conservan.';
  } finally { listaOcupada = false; $('#actualizar').disabled = false; }
}

document.querySelectorAll('[data-escenario]').forEach((boton) => { boton.addEventListener('click', () => seleccionarEscenario(boton.dataset.escenario)); });
$('#tab-escenarios').addEventListener('click', () => cambiarPestana(false));
$('#tab-crear').addEventListener('click', () => cambiarPestana(true));
document.querySelectorAll('[role=tab]').forEach((tab) => tab.addEventListener('keydown', (evento) => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(evento.key)) { evento.preventDefault(); cambiarPestana(evento.key === 'Home' ? false : evento.key === 'End' ? true : tab.id !== 'tab-crear', true); }
}));
$('#form-escenario').addEventListener('submit', (evento) => { evento.preventDefault(); const escenario = escenarios[escenarioActual]; void enviar(escenario.ruta(), escenario.metodo, escenario.cuerpo); });
$('#form-crear').addEventListener('submit', async (evento) => {
  evento.preventDefault(); if (ocupada) return;
  const campos = ['nombre', 'asunto', 'mensaje'];
  campos.forEach((campo) => { $(`#error-${campo}`).textContent = ''; $(`#${campo}`).removeAttribute('aria-invalid'); });
  const cuerpo = Object.fromEntries(campos.map((campo) => [campo, $(`#${campo}`).value]));
  const resultado = await enviar('/api/solicitudes', 'POST', cuerpo);
  if (resultado?.datos.error?.campos) {
    for (const campo of campos) {
      const mensaje = resultado.datos.error.campos[campo];
      if (mensaje) { $(`#error-${campo}`).textContent = mensaje; $(`#${campo}`).setAttribute('aria-invalid', 'true'); }
    }
    const primero = campos.find((campo) => resultado.datos.error.campos[campo]);
    if (primero) $(`#${primero}`).focus();
  }
});
$('#recuperar').addEventListener('click', () => { cambiarPestana(false); seleccionarEscenario('correcta'); void enviar(`/api/solicitudes/${ultimoId}`); });
$('#actualizar').addEventListener('click', () => { void actualizarRecientes(); void comprobarConexion(); });
$('#limpiar-historial').addEventListener('click', () => { historial.length = 0; dibujarHistorial(); });
void comprobarConexion();
void actualizarRecientes();
