<?php

require_once __DIR__ . '/../../src/Database.php';

class AuditService
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getConnection();
    }

    /**
     * Write an audit log entry.
     *
     * @param int|null $userId
     * @param string   $action
     * @param array    $metadata
     */
    public function log(?int $userId, string $action, array $metadata = []): void
    {
        try {
            $sql = 'INSERT INTO audit_logs (user_id, action, ip_address, metadata)
                    VALUES (?, ?, ?, ?)';
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $userId,
                $action,
                $_SERVER['REMOTE_ADDR'] ?? null,
                $metadata ? json_encode($metadata, JSON_UNESCAPED_UNICODE) : null,
            ]);
        } catch (Throwable $e) {
            error_log('audit log skipped: ' . $e->getMessage());
        }
    }
}
