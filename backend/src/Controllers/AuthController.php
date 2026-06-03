<?php

class AuthController
{
    private PDO $pdo;
    private AuditService $audit;
    private SessionContext $sessionCtx;

    public function __construct(PDO $pdo, AuditService $audit, SessionContext $sessionCtx)
    {
        $this->pdo = $pdo;
        $this->audit = $audit;
        $this->sessionCtx = $sessionCtx;
    }

    public function login(): void
    {
        require_method('POST');
        $input = read_json_body();
        $userId = trim($input['userId'] ?? '');
        $password = (string)($input['password'] ?? '');

        if ($userId === '' || $password === '') {
            json_response(['success' => false, 'error' => 'User ID and password are required'], 400);
        }

        $auth = new AuthService();
        $result = $auth->login($userId, $password);

        if (!$result['success']) {
            // Return the actual error message from AuthService instead of a generic one
            json_response(['success' => false, 'error' => $result['error'] ?? 'Invalid User ID or password'], 401);
        }

        $user = $result['user'];

        session_regenerate_id(true);
        $_SESSION['user_id']        = $user['id'];
        $_SESSION['unique_user_id'] = $user['unique_id'];
        $_SESSION['role']           = $user['role'];
        $_SESSION['college_id']     = $user['college_id'];

        json_response([
            'success' => true,
            'user' => [
                'id'         => $user['id'],
                'unique_id'  => $user['unique_id'],
                'name'       => $user['name'],
                'email'      => $user['email'],
                'role'       => $user['role'],
                'college_id' => $user['college_id'],
                'college_name' => $user['college_name'] ?? null,
                'college_logo_url' => $user['college_logo_url'] ?? null,
                'last_login' => $user['last_login'],
                'profile_photo_url' => $user['profile_photo_url'] ?? null,
            ],
        ]);
    }

    public function logout(): void
    {
        Session::requireAuth($this->sessionCtx);
        if ($this->sessionCtx->currentUser !== null) {
            $this->audit->log($this->sessionCtx->currentUser['id'], 'logout', []);
        }
        session_unset();
        session_destroy();
        json_response(['success' => true]);
    }

    public function me(): void
    {
        if ($this->sessionCtx->currentUser === null) {
            json_response(['authenticated' => false], 200);
        }

        $stmt = $this->pdo->prepare(
            "SELECT u.id, u.unique_user_id AS unique_id, u.name, u.email,
                    COALESCE(u.profile_photo_data, u.profile_photo_path) AS profile_photo_url,
                    u.role, u.college_id, u.last_login,
                    c.name AS college_name, c.logo AS college_logo
             FROM users u
             LEFT JOIN colleges c ON c.id = u.college_id
             WHERE u.id = :id
             LIMIT 1"
        );
        $stmt->execute([':id' => $this->sessionCtx->currentUser['id']]);
        $user = $stmt->fetch();
        if (!$user) {
            session_unset();
            session_destroy();
            json_response(['authenticated' => false], 200);
        }

        json_response([
            'authenticated' => true,
            'user' => [
                'id' => (int)$user['id'],
                'unique_id' => $user['unique_id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'role' => $user['role'],
                'college_id' => $user['college_id'],
                'college_name' => $user['college_name'],
                'college_logo_url' => $user['college_logo'],
                'last_login' => $user['last_login'],
                'profile_photo_url' => $user['profile_photo_url'],
            ],
        ]);
    }

    public function requestPasswordReset(): void
    {
        require_method('POST');
        $input = read_json_body();
        $identifier = trim($input['identifier'] ?? '');
        if ($identifier === '') {
            json_response(['success' => false, 'error' => 'Identifier is required'], 400);
        }

        $stmt = $this->pdo->prepare('SELECT id, email FROM users WHERE email = :email OR unique_user_id = :uid LIMIT 1');
        $stmt->execute([':email' => $identifier, ':uid' => $identifier]);
        $user = $stmt->fetch();
        if (!$user) {
            json_response(['success' => true]);
        }

        $otp = random_int(100000, 999999);
        $hash = password_hash((string)$otp, PASSWORD_DEFAULT);
        $expiresAt = (new DateTime('+15 minutes'))->format('Y-m-d H:i:s');

        $this->pdo->prepare('INSERT INTO password_resets (user_id, otp_hash, expires_at)
                       VALUES (:uid, :hash, :exp)
                       ON DUPLICATE KEY UPDATE otp_hash = VALUES(otp_hash), expires_at = VALUES(expires_at), created_at = NOW()')
            ->execute([':uid' => $user['id'], ':hash' => $hash, ':exp' => $expiresAt]);

        if (!empty($user['email'])) {
            $subject = 'Password reset OTP';
            $body = "Your password reset OTP is: {$otp}\nThis code is valid for 15 minutes.";
            $headers = 'From: ' . SMTP_FROM_NAME . ' <' . SMTP_FROM_EMAIL . '>';
            @mail($user['email'], $subject, $body, $headers);
        }

        $this->audit->log((int)$user['id'], 'password_reset_requested', []);
        json_response(['success' => true]);
    }

    public function resetPassword(): void
    {
        require_method('POST');
        $input = read_json_body();
        $identifier = trim($input['identifier'] ?? '');
        $otp = trim($input['otp'] ?? '');
        $newPassword = (string)($input['newPassword'] ?? '');

        if ($identifier === '' || $otp === '' || $newPassword === '') {
            json_response(['success' => false, 'error' => 'Identifier, OTP and new password are required'], 400);
        }

        $stmt = $this->pdo->prepare('SELECT id FROM users WHERE email = :email OR unique_user_id = :uid LIMIT 1');
        $stmt->execute([':email' => $identifier, ':uid' => $identifier]);
        $user = $stmt->fetch();
        if (!$user) {
            json_response(['success' => false, 'error' => 'Invalid OTP or user'], 400);
        }

        $stmt = $this->pdo->prepare('SELECT id, otp_hash, expires_at FROM password_resets WHERE user_id = :uid LIMIT 1');
        $stmt->execute([':uid' => $user['id']]);
        $reset = $stmt->fetch();
        if (
            !$reset ||
            new DateTime($reset['expires_at']) < new DateTime() ||
            !password_verify($otp, $reset['otp_hash'])
        ) {
            json_response(['success' => false, 'error' => 'Invalid or expired OTP'], 400);
        }

        $hash = password_hash($newPassword, PASSWORD_DEFAULT);
        $this->pdo->prepare('UPDATE users SET password_hash = :hash WHERE id = :id')
            ->execute([':hash' => $hash, ':id' => $user['id']]);
        $this->pdo->prepare('DELETE FROM password_resets WHERE id = :id')
            ->execute([':id' => $reset['id']]);

        $this->audit->log((int)$user['id'], 'password_reset_success', []);
        json_response(['success' => true]);
    }

    public function changePassword(): void
    {
        Session::requireAuth($this->sessionCtx);
        require_method('POST');
        $input = read_json_body();
        $current = (string)($input['currentPassword'] ?? '');
        $new = (string)($input['newPassword'] ?? '');

        if ($current === '' || $new === '') {
            json_response(['success' => false, 'error' => 'Current and new password are required'], 400);
        }

        $uid = $this->sessionCtx->currentUser['id'];
        $stmt = $this->pdo->prepare('SELECT password_hash FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $uid]);
        $row = $stmt->fetch();
        if (!$row || !password_verify($current, $row['password_hash'])) {
            json_response(['success' => false, 'error' => 'Current password is incorrect'], 400);
        }

        $hash = password_hash($new, PASSWORD_DEFAULT);
        $this->pdo->prepare('UPDATE users SET password_hash = :hash WHERE id = :id')
            ->execute([':hash' => $hash, ':id' => $uid]);

        $this->audit->log((int)$uid, 'password_changed', []);
        json_response(['success' => true]);
    }
}
