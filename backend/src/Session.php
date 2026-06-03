<?php

require_once __DIR__ . '/Database.php';

/**
 * Centralised session + auth helpers.
 *
 * Usage:
 *   $ctx = Session::init();
 *   $currentUser = $ctx->currentUser; // or null
 */
final class SessionContext
{
    public ?array $currentUser = null;
}

final class Session
{
    public static function init(): SessionContext
    {
        if (session_status() === PHP_SESSION_NONE) {
            ini_set('session.name', SESSION_NAME);
            session_start();
        }

        $ctx = new SessionContext();

        // Inactivity timeout
        if (isset($_SESSION['last_activity']) && (time() - $_SESSION['last_activity'] > SESSION_TIMEOUT)) {
            session_unset();
            session_destroy();
            $ctx->currentUser = null;
            return $ctx;
        }
        $_SESSION['last_activity'] = time();

        if (isset($_SESSION['user_id'])) {
            $ctx->currentUser = [
                'id'         => (int)($_SESSION['user_id']),
                'unique_id'  => $_SESSION['unique_user_id'] ?? null,
                'role'       => $_SESSION['role'] ?? null,
                'college_id' => $_SESSION['college_id'] ?? null,
            ];
        }

        return $ctx;
    }

    public static function requireAuth(SessionContext $ctx): void
    {
        if ($ctx->currentUser === null) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Authentication required']);
            exit;
        }
    }

    public static function requireRole(SessionContext $ctx, array $roles): void
    {
        self::requireAuth($ctx);
        $role = $ctx->currentUser['role'] ?? null;
        if ($role === null || !in_array($role, $roles, true)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Forbidden']);
            exit;
        }
    }

    /**
     * Helper to append college condition for non super-admin users.
     *
     * Returns ['sql' => ' AND college_id = :college_id', 'params' => [':college_id' => ...]]
     * or empty array for super admins.
     */
    public static function collegeScope(SessionContext $ctx): array
    {
        if ($ctx->currentUser === null) {
            return [];
        }
        if (($ctx->currentUser['role'] ?? null) === 'super_admin') {
            return [];
        }

        return [
            'sql'    => ' AND college_id = :college_id',
            'params' => [':college_id' => $ctx->currentUser['college_id']],
        ];
    }
}

