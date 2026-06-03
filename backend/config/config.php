<?php

// Basic application configuration for backend
//
// Shared-hosting friendly: loads from .env if present,
// otherwise falls back to defaults that you MUST change.

// Simple .env loader (KEY=VALUE per line)
if (file_exists(__DIR__ . '/../../.env')) {
    $lines = file(__DIR__ . '/../../.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') {
            continue;
        }
        if (strpos($line, '=') === false) {
            continue;
        }
        [$key, $value] = array_map('trim', explode('=', $line, 2));
        if ($key !== '' && !array_key_exists($key, $_ENV)) {
            $_ENV[$key] = $value;
        }
    }
}

// Environment: "production" or "development" (set APP_ENV in .env)
define('APP_ENV', $_ENV['APP_ENV'] ?? 'development');

// Database
// All values MUST come from .env — no hardcoded credentials in source code
define('DB_HOST',    $_ENV['DB_HOST']    ?? '');
define('DB_PORT',    $_ENV['DB_PORT']    ?? 3306);
define('DB_SOCKET',  $_ENV['DB_SOCKET']  ?? '');
define('DB_NAME',    $_ENV['DB_NAME']    ?? '');
define('DB_USER',    $_ENV['DB_USER']    ?? '');
define('DB_PASS',    $_ENV['DB_PASS']    ?? '');
define('DB_CHARSET', $_ENV['DB_CHARSET'] ?? 'utf8mb4');

// SMTP (for password reset emails) – configure via .env on hosting
define('SMTP_FROM_EMAIL', 'no-reply@example.com');
define('SMTP_FROM_NAME', 'Attendance Management');

// Session settings
define('SESSION_NAME',    $_ENV['SESSION_NAME']    ?? 'ams_session');
define('SESSION_TIMEOUT', (int)($_ENV['SESSION_TIMEOUT'] ?? 1800)); // seconds

// CORS / frontend origin — MUST be set in .env for production
// Use '*' only for local dev; set explicit domain on production hosting
define('FRONTEND_ORIGIN', $_ENV['FRONTEND_ORIGIN'] ?? '*');

// PHP session performance: reduce lock contention under high concurrency
ini_set('session.gc_maxlifetime', SESSION_TIMEOUT);
ini_set('session.cookie_lifetime', '0');  // Session cookies (browser-lifetime)

// PWA / Cross-context cookie fix:
// SameSite=None is required so that installed PWAs (standalone mode) can
// send & receive session cookies on every request, including POST (login).
// Without this, Chrome/Android treats PWA as cross-origin and blocks Lax cookies.
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
           || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
           || (($_SERVER['SERVER_PORT'] ?? 80) == 443);
ini_set('session.cookie_samesite', $isHttps ? 'None' : 'Lax');
ini_set('session.cookie_secure',   $isHttps ? '1'    : '0');
ini_set('session.cookie_httponly', '1');

// Error reporting (disable display_errors in production, keep logging)
if (APP_ENV === 'production') {
    error_reporting(E_ALL & ~E_NOTICE & ~E_STRICT);
    ini_set('display_errors', '0');
} else {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
}

// Set default time zone to India (IST)
date_default_timezone_set('Asia/Kolkata');
