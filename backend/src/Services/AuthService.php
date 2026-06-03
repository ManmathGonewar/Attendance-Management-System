<?php

require_once __DIR__ . '/../../src/Database.php';
require_once __DIR__ . '/AuditService.php';

class AuthService
{
    private PDO $db;
    private AuditService $audit;

    public function __construct()
    {
        $this->db = Database::getConnection();
        $this->audit = new AuditService();
    }

    public function login(string $uniqueUserId, string $password): array
    {
        $profilePhotoSelect = $this->profilePhotoSelectSql();
        $sql = "SELECT u.id, u.unique_user_id, u.college_id, u.name, u.email, {$profilePhotoSelect}, u.password_hash, u.role, u.status, u.last_login,
                       c.name AS college_name, c.logo AS college_logo, c.status AS college_status, c.archived_at AS college_archived_at
                FROM users u
                LEFT JOIN colleges c ON c.id = u.college_id
                WHERE u.unique_user_id = :uid
                LIMIT 1";
        
        try {
            $stmt = $this->db->prepare($sql);
            $stmt->execute([':uid' => $uniqueUserId]);
            $user = $stmt->fetch();
        } catch (Throwable $e) {
            error_log('Login query error: ' . $e->getMessage());
            $this->audit->log(null, 'login_failed', ['unique_user_id' => $uniqueUserId, 'error' => 'Database query failed']);
            return ['success' => false, 'error' => 'Database error occurred. Please try again later.'];
        }

        if (!$user) {
            $this->audit->log(null, 'login_failed', ['unique_user_id' => $uniqueUserId, 'reason' => 'user_not_found']);
            return ['success' => false, 'error' => 'Invalid User ID or password'];
        }

        if ($user['status'] !== 'active') {
            $this->audit->log((int)$user['id'], 'login_failed', ['unique_user_id' => $uniqueUserId, 'reason' => 'user_inactive', 'status' => $user['status']]);
            return ['success' => false, 'error' => 'Your account is inactive. Contact your administrator.'];
        }

        if (!password_verify($password, $user['password_hash'])) {
            $this->audit->log((int)$user['id'], 'login_failed', ['unique_user_id' => $uniqueUserId, 'reason' => 'wrong_password']);
            return ['success' => false, 'error' => 'Invalid User ID or password'];
        }

        // College-level access enforcement (multi-tenant safety).
        if (($user['role'] ?? null) !== 'super_admin') {
            $collegeId = (int)($user['college_id'] ?? 0);
            $collegeStatus = (string)($user['college_status'] ?? 'inactive');
            $collegeArchivedAt = $user['college_archived_at'] ?? null;
            if ($collegeId <= 0 || $collegeStatus !== 'active' || $collegeArchivedAt !== null) {
                $this->audit->log((int)$user['id'], 'login_failed', [
                    'unique_user_id' => $uniqueUserId,
                    'reason' => 'college_inactive_or_removed',
                    'college_id' => $collegeId > 0 ? $collegeId : null,
                ]);
                return ['success' => false, 'error' => 'Your college is inactive or has been removed. Contact your administrator.'];
            }
        }

        // Update last_login
        try {
            $this->db->prepare('UPDATE users SET last_login = NOW() WHERE id = :id')
                ->execute([':id' => $user['id']]);
        } catch (Throwable $e) {
            error_log('Failed to update last_login: ' . $e->getMessage());
            // Continue anyway, login should still succeed
        }

        $this->audit->log((int)$user['id'], 'login_success', [
            'unique_user_id' => $uniqueUserId,
            'role'           => $user['role'],
        ]);

        return [
            'success' => true,
            'user' => [
                'id'          => (int)$user['id'],
                'unique_id'   => $user['unique_user_id'],
                'college_id'  => $user['college_id'],
                'name'        => $user['name'],
                'email'       => $user['email'],
                'role'        => $user['role'],
                'college_name'=> $user['college_name'],
                'college_logo_url' => $user['college_logo'],
                'last_login'  => $user['last_login'],
                'profile_photo_url' => $user['profile_photo_url'] ?? null,
            ],
        ];
    }

    private function hasColumn(string $column): bool
    {
        static $cached = [];
        if (array_key_exists($column, $cached)) {
            return (bool)$cached[$column];
        }

        try {
            $stmt = $this->db->query("SHOW COLUMNS FROM users LIKE " . $this->db->quote($column));
            $cached[$column] = (bool)$stmt->fetch();
        } catch (Throwable $e) {
            $cached[$column] = false;
        }

        return (bool)$cached[$column];
    }

    private function profilePhotoSelectSql(): string
    {
        $hasData = $this->hasColumn('profile_photo_data');
        $hasPath = $this->hasColumn('profile_photo_path');

        if ($hasData && $hasPath) {
            return 'COALESCE(u.profile_photo_data, u.profile_photo_path) AS profile_photo_url';
        }
        if ($hasData) {
            return 'u.profile_photo_data AS profile_photo_url';
        }
        if ($hasPath) {
            return 'u.profile_photo_path AS profile_photo_url';
        }
        return 'NULL AS profile_photo_url';
    }
}
