-- ============================================================
-- Skilly - Base de datos para XAMPP (MySQL / MariaDB)
-- Basada en tu esquema original (usuarios, clientes, empresas,
-- profesionales, reservas, pagos_escrow, ...), ampliada con lo
-- que el proyecto necesita (bloques, boletas, reclamos, etc.).
--
-- IMPORTANTE: este script BORRA y vuelve a crear la base `skilly`.
-- Importar desde phpMyAdmin: pestaña "Importar" -> elegir este archivo -> Importar.
-- ============================================================
DROP DATABASE IF EXISTS `skilly`;
CREATE DATABASE `skilly` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `skilly`;

-- ---------- TABLAS QUE USA EL PROYECTO ----------

-- Todos los usuarios (admin, cliente, empresa, profesional). Contrasena cifrada (scrypt).
CREATE TABLE `usuarios` (
  `id_usuario` varchar(30) NOT NULL,
  `correo` varchar(150) NOT NULL,
  `contrasena` varchar(255) NOT NULL,
  `rol` enum('admin','cliente','empresa','profesional') NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `telefono` varchar(40) DEFAULT NULL,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_usuario`),
  UNIQUE KEY `correo` (`correo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Perfil de persona (sin empresa). id_cliente = id_usuario
CREATE TABLE `clientes` (
  `id_cliente` varchar(30) NOT NULL,
  `id_usuario` varchar(30) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `apellidos` varchar(100) NOT NULL DEFAULT '',
  `telefono` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id_cliente`),
  KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `clientes_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Perfil de empresa. id_empresa = id_usuario
CREATE TABLE `empresas` (
  `id_empresa` varchar(30) NOT NULL,
  `id_usuario` varchar(30) NOT NULL,
  `razon_social` varchar(150) NOT NULL,
  `rut` varchar(20) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `contacto` varchar(100) DEFAULT NULL,
  `industria` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id_empresa`),
  KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `empresas_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Perfil de profesional. id_profesional = id_usuario
CREATE TABLE `profesionales` (
  `id_profesional` varchar(30) NOT NULL,
  `id_usuario` varchar(30) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `especialidad` varchar(100) NOT NULL DEFAULT '',
  `tarifa_hora` decimal(10,2) DEFAULT 0.00,
  `rut` varchar(20) DEFAULT NULL,
  `linkedin` varchar(255) DEFAULT NULL,
  `anios` varchar(20) DEFAULT NULL,
  `estado_tarifa` enum('propuesta','contraoferta','acordada') DEFAULT NULL,
  `estado` enum('pendiente','activo','baja') DEFAULT NULL,
  `entrevistas` int(11) NOT NULL DEFAULT 0,
  `alertas` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id_profesional`),
  KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `profesionales_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Bloques de disponibilidad definidos por el profesional (max. 4 horas)
CREATE TABLE `bloques_disponibilidad` (
  `id_bloque` varchar(30) NOT NULL,
  `id_profesional` varchar(30) NOT NULL,
  `fecha` varchar(10) NOT NULL,
  `hora_inicio` int(11) NOT NULL,
  `hora_fin` int(11) NOT NULL,
  `tomado` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id_bloque`),
  KEY `id_profesional` (`id_profesional`),
  CONSTRAINT `bloques_ibfk_1` FOREIGN KEY (`id_profesional`) REFERENCES `profesionales` (`id_profesional`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Reservas. id_cliente apunta al usuario (cliente o empresa); NULL si reservo como invitado.
CREATE TABLE `reservas` (
  `id_reserva` varchar(30) NOT NULL,
  `id_bloque` varchar(30) NOT NULL,
  `id_profesional` varchar(30) NOT NULL,
  `id_cliente` varchar(30) DEFAULT NULL,
  `correo_invitado` varchar(150) DEFAULT NULL,
  `titulo` varchar(200) DEFAULT NULL,
  `fecha_reserva` datetime DEFAULT NULL,
  `horas` int(11) DEFAULT NULL,
  `monto_total` int(11) DEFAULT NULL,
  `comision` int(11) DEFAULT NULL,
  `monto_neto` int(11) DEFAULT NULL,
  `estado` enum('pendiente_pago','agendado','en_disputa','completado','cancelado') NOT NULL,
  `reagendada` tinyint(1) NOT NULL DEFAULT 0,
  `monto_escrow` int(11) DEFAULT NULL,
  `monto_reembolso` int(11) DEFAULT NULL,
  `penalizacion` int(11) DEFAULT NULL,
  `disputa` longtext DEFAULT NULL,
  `creado` bigint(20) DEFAULT NULL,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_reserva`),
  KEY `id_bloque` (`id_bloque`),
  KEY `id_profesional` (`id_profesional`),
  KEY `id_cliente` (`id_cliente`),
  CONSTRAINT `reservas_ibfk_1` FOREIGN KEY (`id_bloque`) REFERENCES `bloques_disponibilidad` (`id_bloque`),
  CONSTRAINT `reservas_ibfk_2` FOREIGN KEY (`id_profesional`) REFERENCES `profesionales` (`id_profesional`),
  CONSTRAINT `reservas_ibfk_3` FOREIGN KEY (`id_cliente`) REFERENCES `usuarios` (`id_usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Pagos en custodia. El servidor genera una fila por reserva pagada (id_pago = 'P-' + id_reserva).
CREATE TABLE `pagos_escrow` (
  `id_pago` varchar(40) NOT NULL,
  `id_reserva` varchar(30) NOT NULL,
  `monto_total` decimal(12,2) NOT NULL,
  `comision_plataforma` decimal(10,2) NOT NULL,
  `estado_fondos` enum('retenido_en_escrow','liberado_al_profesional','reembolsado') DEFAULT 'retenido_en_escrow',
  `fecha_transaccion` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_pago`),
  KEY `id_reserva` (`id_reserva`),
  CONSTRAINT `pagos_escrow_ibfk_1` FOREIGN KEY (`id_reserva`) REFERENCES `reservas` (`id_reserva`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Transacciones Webpay Plus (Transbank): un registro por cada intento de pago.
-- buy_order = orden de compra enviada a Transbank; token = token_ws de la transacción.
CREATE TABLE `transacciones_webpay` (
  `buy_order` varchar(30) NOT NULL,
  `id_reserva` varchar(30) NOT NULL,
  `token` varchar(100) DEFAULT NULL,
  `monto` int(11) NOT NULL,
  `estado` enum('iniciada','procesando','autorizada','rechazada','abandonada','expirada','error','reembolsada') NOT NULL DEFAULT 'iniciada',
  `modo` enum('integracion','produccion','simulado') NOT NULL,
  `codigo_respuesta` int(11) DEFAULT NULL,
  `codigo_autorizacion` varchar(12) DEFAULT NULL,
  `tipo_pago` varchar(4) DEFAULT NULL,
  `cuotas` int(11) DEFAULT NULL,
  `tarjeta_ultimos4` char(4) DEFAULT NULL,
  `fecha_transaccion` bigint(20) DEFAULT NULL,
  `monto_reembolso` int(11) DEFAULT NULL,
  `estado_reembolso` varchar(20) DEFAULT NULL,
  `creado` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`buy_order`),
  UNIQUE KEY `uq_token` (`token`),
  KEY `idx_reserva` (`id_reserva`),
  KEY `idx_estado` (`estado`),
  CONSTRAINT `fk_webpay_reserva` FOREIGN KEY (`id_reserva`) REFERENCES `reservas` (`id_reserva`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Boleta del profesional (se genera cuando el cliente marca "Terminado")
CREATE TABLE `boletas` (
  `id_boleta` varchar(30) NOT NULL,
  `id_reserva` varchar(30) NOT NULL,
  `id_profesional` varchar(30) NOT NULL,
  `monto` int(11) DEFAULT NULL,
  `comision` int(11) DEFAULT NULL,
  `fecha` bigint(20) DEFAULT NULL,
  `sii` varchar(20) DEFAULT 'manual',
  PRIMARY KEY (`id_boleta`),
  KEY `id_reserva` (`id_reserva`),
  KEY `id_profesional` (`id_profesional`),
  CONSTRAINT `boletas_ibfk_1` FOREIGN KEY (`id_reserva`) REFERENCES `reservas` (`id_reserva`) ON DELETE CASCADE,
  CONSTRAINT `boletas_ibfk_2` FOREIGN KEY (`id_profesional`) REFERENCES `profesionales` (`id_profesional`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Historial de reclamos (reputacion interna, solo lo ve Skilly)
CREATE TABLE `reclamos` (
  `id_reclamo` varchar(30) NOT NULL,
  `id_reserva` varchar(30) NOT NULL,
  `id_cliente` varchar(30) DEFAULT NULL,
  `id_profesional` varchar(30) NOT NULL,
  `motivo` varchar(200) DEFAULT NULL,
  `detalle` text DEFAULT NULL,
  `fecha` bigint(20) DEFAULT NULL,
  `estado` enum('abierto','resuelto') NOT NULL DEFAULT 'abierto',
  `resolucion` varchar(255) DEFAULT NULL,
  `cerrado` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id_reclamo`),
  KEY `id_reserva` (`id_reserva`),
  KEY `id_cliente` (`id_cliente`),
  KEY `id_profesional` (`id_profesional`),
  CONSTRAINT `reclamos_ibfk_1` FOREIGN KEY (`id_reserva`) REFERENCES `reservas` (`id_reserva`) ON DELETE CASCADE,
  CONSTRAINT `reclamos_ibfk_2` FOREIGN KEY (`id_cliente`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL,
  CONSTRAINT `reclamos_ibfk_3` FOREIGN KEY (`id_profesional`) REFERENCES `profesionales` (`id_profesional`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Feedback privado de clientes hacia Skilly (nada publico)
CREATE TABLE `feedback_clientes` (
  `id_feedback` varchar(30) NOT NULL,
  `id_reserva` varchar(30) NOT NULL,
  `id_profesional` varchar(30) NOT NULL,
  `texto` text DEFAULT NULL,
  `fecha` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id_feedback`),
  KEY `id_reserva` (`id_reserva`),
  KEY `id_profesional` (`id_profesional`),
  CONSTRAINT `feedback_ibfk_1` FOREIGN KEY (`id_reserva`) REFERENCES `reservas` (`id_reserva`) ON DELETE CASCADE,
  CONSTRAINT `feedback_ibfk_2` FOREIGN KEY (`id_profesional`) REFERENCES `profesionales` (`id_profesional`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Sesiones iniciadas
CREATE TABLE `sesiones` (
  `token` varchar(60) NOT NULL,
  `id_usuario` varchar(30) NOT NULL,
  PRIMARY KEY (`token`),
  KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `sesiones_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Configuracion (una sola fila): comision %, penalizacion %, horas maximas por bloque
CREATE TABLE `configuracion` (
  `id` int(11) NOT NULL,
  `comision` int(11) NOT NULL,
  `penalizacion` int(11) NOT NULL,
  `horas_maximas` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
INSERT INTO `configuracion` (`id`, `comision`, `penalizacion`, `horas_maximas`) VALUES (1, 10, 20, 4);

-- ---------- TABLAS DE TU ESQUEMA ORIGINAL (aun no usadas por el proyecto) ----------
-- Se conservan para futuras funciones. Los IDs de usuario/empresa/profesional son varchar(30)
-- para que coincidan con las tablas de arriba.

CREATE TABLE `categorias` (
  `id_categoria` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id_categoria`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `servicios_marketplace` (
  `id_servicio` int(11) NOT NULL AUTO_INCREMENT,
  `id_profesional` varchar(30) DEFAULT NULL,
  `id_empresa` varchar(30) DEFAULT NULL,
  `titulo` varchar(150) NOT NULL,
  `descripcion` text NOT NULL,
  `precio` decimal(10,2) NOT NULL,
  `estado` enum('activo','inactivo') DEFAULT 'activo',
  PRIMARY KEY (`id_servicio`),
  KEY `id_profesional` (`id_profesional`),
  KEY `id_empresa` (`id_empresa`),
  CONSTRAINT `servicios_marketplace_ibfk_1` FOREIGN KEY (`id_profesional`) REFERENCES `profesionales` (`id_profesional`) ON DELETE CASCADE,
  CONSTRAINT `servicios_marketplace_ibfk_2` FOREIGN KEY (`id_empresa`) REFERENCES `empresas` (`id_empresa`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `mensajes` (
  `id_mensaje` int(11) NOT NULL AUTO_INCREMENT,
  `id_emisor` varchar(30) NOT NULL,
  `id_receptor` varchar(30) NOT NULL,
  `contenido` text NOT NULL,
  `leido` tinyint(1) DEFAULT 0,
  `fecha_envio` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_mensaje`),
  KEY `id_emisor` (`id_emisor`),
  KEY `id_receptor` (`id_receptor`),
  CONSTRAINT `mensajes_ibfk_1` FOREIGN KEY (`id_emisor`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE,
  CONSTRAINT `mensajes_ibfk_2` FOREIGN KEY (`id_receptor`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `auditorias_talento` (
  `id_auditoria` int(11) NOT NULL AUTO_INCREMENT,
  `id_empresa_evaluadora` varchar(30) NOT NULL,
  `id_profesional` varchar(30) NOT NULL,
  `calificacion_tecnica` int(11) DEFAULT NULL,
  `comentarios_auditoria` text DEFAULT NULL,
  `estado_verificacion` enum('pendiente','aprobado','rechazado') DEFAULT 'pendiente',
  `fecha_auditoria` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_auditoria`),
  KEY `id_empresa_evaluadora` (`id_empresa_evaluadora`),
  KEY `id_profesional` (`id_profesional`),
  CONSTRAINT `auditorias_talento_ibfk_1` FOREIGN KEY (`id_empresa_evaluadora`) REFERENCES `empresas` (`id_empresa`) ON DELETE CASCADE,
  CONSTRAINT `auditorias_talento_ibfk_2` FOREIGN KEY (`id_profesional`) REFERENCES `profesionales` (`id_profesional`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `documentos_onboarding` (
  `id_documento` int(11) NOT NULL AUTO_INCREMENT,
  `id_empresa` varchar(30) NOT NULL,
  `tipo_documento` enum('rut_empresa','constitucion_sociedad','representante_legal','otro') NOT NULL,
  `ruta_archivo` varchar(255) NOT NULL,
  `estado_validacion` enum('subido','en_revision','verificado','rechazado') DEFAULT 'subido',
  `fecha_subida` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_documento`),
  KEY `id_empresa` (`id_empresa`),
  CONSTRAINT `documentos_onboarding_ibfk_1` FOREIGN KEY (`id_empresa`) REFERENCES `empresas` (`id_empresa`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- El usuario admin (admin@skilly.cl / admin123) se crea solo al iniciar el servidor.
