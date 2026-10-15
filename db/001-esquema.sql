CREATE TABLE IF NOT EXISTS solicitudes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL CHECK (char_length(nombre) BETWEEN 2 AND 80),
  asunto VARCHAR(120) NOT NULL CHECK (char_length(asunto) BETWEEN 4 AND 120),
  mensaje TEXT NOT NULL CHECK (char_length(mensaje) BETWEEN 10 AND 2000),
  estado VARCHAR(20) NOT NULL DEFAULT 'Recibida' CHECK (estado IN ('Recibida', 'En revisión', 'Resuelta')),
  creada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO solicitudes (nombre, asunto, mensaje, estado) VALUES
  ('Sebastián', 'Acceso a la plataforma', 'Necesito revisar el acceso a la plataforma del curso.', 'En revisión'),
  ('Santiago', 'Certificado de participación', 'Quisiera consultar el proceso para obtener mi certificado.', 'Recibida'),
  ('Mariana', 'Horario de asesoría', '¿Podrían confirmar los horarios de asesoría de esta semana?', 'Resuelta');
