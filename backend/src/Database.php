<?php

require_once __DIR__ . '/../config/config.php';

class Database
{
    private static ?PDO $instance = null;

    public static function getConnection(): PDO
    {
        if (self::$instance !== null) {
            return self::$instance;
        }

        $host = trim((string)DB_HOST);
        $user = (string)DB_USER;
        $pass = (string)DB_PASS;
        $name = (string)DB_NAME;
        $port = (int)DB_PORT;
        $charset = (string)DB_CHARSET;

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_PERSISTENT => false,
            PDO::ATTR_TIMEOUT => 30,
        ];

        $dsn = "mysql:host={$host};port={$port};dbname={$name};charset={$charset}";

        // Fallback for local development if host is empty
        if ($host === '' || $host === 'localhost' || $host === '127.0.0.1') {
            $isLocal = true;
        }
        else {
            $isLocal = false;
        }

        $lastException = null;
        // Retry loop: handle transient "Too many connections" or host resolution hiccups
        for ($i = 0; $i < 2; $i++) {
            try {
                self::$instance = new PDO($dsn, $user, $pass, $options);
                self::$instance->exec("SET time_zone = '+05:30'");
                return self::$instance;
            }
            catch (PDOException $e) {
                $lastException = $e;
                if ($i === 0 && ($e->getCode() == 1040 || $e->getCode() == 2002)) {
                    usleep(100000); // Wait 100ms before retry
                    continue;
                }
                break;
            }
        }

        // If primary host failed and it's local, try socket fallback
        if ($isLocal) {
            $socketDsn = "mysql:unix_socket=/var/run/mysqld/mysqld.sock;dbname={$name};charset={$charset}";
            try {
                self::$instance = new PDO($socketDsn, $user, $pass, $options);
                return self::$instance;
            }
            catch (PDOException $e) {
            // Return original primary error if socket also fails
            }
        }

        if ($lastException) {
            throw $lastException;
        }

        throw new PDOException("Could not establish database connection.");
    }
}