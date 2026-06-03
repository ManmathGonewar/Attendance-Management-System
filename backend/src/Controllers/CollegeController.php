<?php

require_once __DIR__ . '/../Services/AuditService.php';

class CollegeController
{
    private PDO $pdo;
    private AuditService $audit;
    private ?array $currentUser;

    public function __construct(PDO $pdo, AuditService $audit, ?array $currentUser)
    {
        $this->pdo = $pdo;
        $this->audit = $audit;
        $this->currentUser = $currentUser;
    }

    public function save(array $input): array
    {
        $idValue = $input['id'] ?? $input['college_id'] ?? null;
        $id = $idValue !== null ? (int)$idValue : null;
        $isEdit = ($id !== null && $id > 0);
        $name = trim((string)($input['name'] ?? ''));
        $status = trim((string)($input['status'] ?? 'active'));
        $shortCode = trim((string)($input['short_code'] ?? ''));
        $contactEmail = trim((string)($input['contact_email'] ?? ''));
        $contactPhone = trim((string)($input['contact_phone'] ?? ''));
        $logoDataUrl = trim((string)($input['logo_image_data'] ?? ''));
        $createAdmin = $isEdit ? false : (!array_key_exists('create_admin', $input) || (bool)$input['create_admin']);
        $adminNameInput = trim((string)($input['admin_name'] ?? ''));
        $adminEmail = trim((string)($input['admin_email'] ?? ''));
        $adminUniqueId = trim((string)($input['admin_unique_user_id'] ?? ''));
        $adminPassword = (string)($input['admin_password'] ?? '');

        if ($name === '' || !in_array($status, ['active', 'inactive'], true)) {
            json_response(['success' => false, 'error' => 'Invalid payload'], 400);
        }

        ensure_college_settings_table($this->pdo);
        ensure_users_id_auto_increment($this->pdo);

        $existingCollege = null;
        if ($isEdit) {
            $stmt = $this->pdo->prepare('SELECT id, logo FROM colleges WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => $id]);
            $existingCollege = $stmt->fetch();
            if (!$existingCollege) {
                json_response(['success' => false, 'error' => 'College not found'], 404);
            }
        } else {
            // Pre-flight: Check for duplicate college name
            $nameChk = $this->pdo->prepare("SELECT id FROM colleges WHERE name = :name AND (archived_at IS NULL OR archived_at > NOW()) LIMIT 1");
            $nameChk->execute([':name' => $name]);
            $existing = $nameChk->fetch();
            if ($existing) {
                json_response([
                    'success' => false,
                    'error'   => "A college named '{$name}' already exists (ID: {$existing['id']}). Use a different name or edit the existing college."
                ], 409);
            }
        }

        $defaultAdminName = $this->buildDefaultAdminName($name);
        $adminName = $adminNameInput !== '' ? $adminNameInput : $defaultAdminName;

        $newLogoPath = null;
        $createdAdmin = null;
        $createdCollegeId = $isEdit ? (int)$id : 0;

        $this->pdo->beginTransaction();
        try {
            if ($isEdit) {
                if ($logoDataUrl !== '') {
                    $newLogoPath = save_college_logo_from_data_url($logoDataUrl, $createdCollegeId);
                }
                if ($newLogoPath !== null) {
                    $stmt = $this->pdo->prepare('UPDATE colleges SET name = :name, status = :status, contact = :contact, logo = :logo WHERE id = :id');
                    $stmt->execute([
                        ':name' => $name,
                        ':status' => $status,
                        ':contact' => ($contactEmail === '' ? null : $contactEmail),
                        ':logo' => $newLogoPath,
                        ':id' => $createdCollegeId,
                    ]);
                } else {
                    $stmt = $this->pdo->prepare('UPDATE colleges SET name = :name, status = :status, contact = :contact WHERE id = :id');
                    $stmt->execute([
                        ':name' => $name,
                        ':status' => $status,
                        ':contact' => ($contactEmail === '' ? null : $contactEmail),
                        ':id' => $createdCollegeId,
                    ]);
                }
            } else {
                // Safety: ensure AUTO_INCREMENT is set before INSERT
                try {
                    $chkStmt = $this->pdo->query("SHOW COLUMNS FROM colleges LIKE 'id'");
                    $chkCol = $chkStmt ? $chkStmt->fetch() : null;
                    if (is_array($chkCol) && strpos(strtolower((string)($chkCol['Extra'] ?? '')), 'auto_increment') === false) {
                        $colType = (string)($chkCol['Type'] ?? 'bigint(20) unsigned');
                        $this->pdo->exec("ALTER TABLE colleges MODIFY `id` {$colType} NOT NULL AUTO_INCREMENT");
                    }
                } catch (Throwable $aiErr) {
                    error_log('colleges auto_increment fix attempt failed: ' . $aiErr->getMessage());
                }

                $stmt = $this->pdo->prepare('INSERT INTO colleges (name, status, contact) VALUES (:name, :status, :contact)');
                $stmt->execute([
                    ':name' => $name,
                    ':status' => $status,
                    ':contact' => ($contactEmail === '' ? null : $contactEmail),
                ]);
                $createdCollegeId = (int)$this->pdo->lastInsertId();

                if ($createdCollegeId <= 0) {
                    throw new \RuntimeException('Failed to create college: database did not generate an ID. Please check that the colleges table has AUTO_INCREMENT on the id column.');
                }

                if ($logoDataUrl !== '') {
                    $newLogoPath = save_college_logo_from_data_url($logoDataUrl, $createdCollegeId);
                    $this->pdo->prepare('UPDATE colleges SET logo = :logo WHERE id = :id')
                        ->execute([':logo' => $newLogoPath, ':id' => $createdCollegeId]);
                }
            }

            $this->pdo->prepare(
                'INSERT INTO college_settings (college_id, short_code, contact_email, contact_phone)
                 VALUES (:cid, :sc, :email, :phone)
                 ON DUPLICATE KEY UPDATE short_code = VALUES(short_code), contact_email = VALUES(contact_email), contact_phone = VALUES(contact_phone)'
            )->execute([
                ':cid' => $createdCollegeId,
                ':sc' => ($shortCode === '' ? null : $shortCode),
                ':email' => ($contactEmail === '' ? null : $contactEmail),
                ':phone' => ($contactPhone === '' ? null : $contactPhone),
            ]);

            if (!$isEdit && $createAdmin) {
                if ($adminUniqueId === '') {
                    $adminUniqueId = generate_college_admin_unique_id($this->pdo);
                }
                if ($adminPassword === '') {
                    $adminPassword = generate_secure_password();
                }

                // Pre-flight: check Login ID uniqueness
                $chk = $this->pdo->prepare("SELECT 1 FROM users WHERE unique_user_id = :uid LIMIT 1");
                $chk->execute([':uid' => $adminUniqueId]);
                if ($chk->fetch()) {
                    $this->pdo->rollBack();
                    json_response([
                        'success' => false,
                        'error' => "Admin Login ID '{$adminUniqueId}' is already taken. Please click Regenerate to get a new one."
                    ], 409);
                }

                // Pre-flight: check email uniqueness (only if email is provided)
                if ($adminEmail !== '') {
                    $chk2 = $this->pdo->prepare("SELECT 1 FROM users WHERE email = :email LIMIT 1");
                    $chk2->execute([':email' => $adminEmail]);
                    if ($chk2->fetch()) {
                        $this->pdo->rollBack();
                        json_response([
                            'success' => false,
                            'error' => "Email '{$adminEmail}' is already registered to another user. Use a different admin email or leave it blank."
                        ], 409);
                    }
                }

                $stmt = $this->pdo->prepare(
                    'INSERT INTO users (unique_user_id, college_id, name, email, password_hash, role, status)
                     VALUES (:uid, :cid, :name, :email, :hash, "college_admin", "active")'
                );
                $stmt->execute([
                    ':uid'   => $adminUniqueId,
                    ':cid'   => $createdCollegeId,
                    ':name'  => $adminName,
                    ':email' => ($adminEmail === '' ? null : $adminEmail),
                    ':hash'  => password_hash($adminPassword, PASSWORD_DEFAULT),
                ]);

                $createdAdmin = [
                    'user_id'        => (int)$this->pdo->lastInsertId(),
                    'unique_user_id' => $adminUniqueId,
                    'password'       => $adminPassword,
                    'name'           => $adminName,
                    'email'          => ($adminEmail === '' ? null : $adminEmail),
                ];
            }

            $this->pdo->commit();
        } catch (PDOException $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            $this->cleanupLogoPath($newLogoPath);
            if ((string)$e->getCode() === '23000') {
                // Detect WHICH field caused the duplicate
                $msg = strtolower($e->getMessage());
                if (str_contains($msg, 'uq_users_unique_user_id') || str_contains($msg, 'unique_user_id')) {
                    json_response(['success' => false, 'error' => "Admin Login ID '{$adminUniqueId}' already exists. Please click Regenerate to get a new ID."], 409);
                } elseif (str_contains($msg, 'uq_users_email') || (str_contains($msg, 'email') && str_contains($msg, 'users'))) {
                    json_response(['success' => false, 'error' => "Admin email '{$adminEmail}' is already registered to another user. Leave it blank or use a different email."], 409);
                } elseif (str_contains($msg, 'colleges')) {
                    json_response(['success' => false, 'error' => "A college with this name already exists."], 409);
                } elseif (str_contains($msg, "duplicate entry '0' for key 'primary'")) {
                    json_response(['success' => false, 'error' => 'Database schema issue: users.id/colleges.id must be AUTO_INCREMENT. Please run the latest schema update once, then retry.'], 409);
                }
                json_response(['success' => false, 'error' => 'A duplicate entry was detected: ' . $e->getMessage()], 409);
            }
            throw $e;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            $this->cleanupLogoPath($newLogoPath);
            throw $e;
        }

        if ($newLogoPath !== null && is_array($existingCollege)) {
            $oldLogoPath = (string)($existingCollege['logo'] ?? '');
            if ($oldLogoPath !== '' && $oldLogoPath !== $newLogoPath && str_starts_with($oldLogoPath, 'uploads/college_logos/')) {
                $oldAbs = dirname(__DIR__, 3) . '/' . $oldLogoPath;
                if (is_file($oldAbs)) {
                    @unlink($oldAbs);
                }
            }
        }

        if ($isEdit) {
            $this->audit->log($this->actorUserId(), 'college_updated', ['id' => $createdCollegeId]);
        } else {
            $this->audit->log($this->actorUserId(), 'college_created', ['id' => $createdCollegeId]);
            if (is_array($createdAdmin)) {
                $this->audit->log($this->actorUserId(), 'superadmin_college_admin_created', [
                    'user_id' => $createdAdmin['user_id'],
                    'unique_user_id' => $createdAdmin['unique_user_id'],
                    'college_id' => $createdCollegeId,
                ]);
            }
        }

        return [
            'success' => true,
            'id' => $createdCollegeId,
            'college_admin' => $createdAdmin,
        ];
    }

    public function createCollegeAdmin(array $input): array
    {
        $uid = trim((string)($input['unique_user_id'] ?? ''));
        $name = trim((string)($input['name'] ?? ''));
        $email = trim((string)($input['email'] ?? ''));
        $pwd = (string)($input['password'] ?? '');
        $cid = isset($input['college_id']) ? (int)$input['college_id'] : 0;
        $genPwd = isset($input['generate_password']) ? (bool)$input['generate_password'] : false;

        if ($name === '' || $cid <= 0) {
            json_response(['success' => false, 'error' => 'name and college_id required'], 400);
        }

        if ($uid === '') {
            $uid = generate_college_admin_unique_id($this->pdo);
        }
        if ($genPwd) {
            $pwd = generate_secure_password();
        } elseif ($pwd === '') {
            json_response(['success' => false, 'error' => 'pwd required or set generate_password'], 400);
        }

        $stmt = $this->pdo->prepare('SELECT id FROM colleges WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $cid]);
        if (!$stmt->fetch()) {
            json_response(['success' => false, 'error' => 'College not found'], 404);
        }

        ensure_users_id_auto_increment($this->pdo);

        try {
            $stmt = $this->pdo->prepare(
                'INSERT INTO users (unique_user_id, college_id, name, email, password_hash, role, status)
                 VALUES (:uid, :cid, :name, :email, :hash, "college_admin", "active")'
            );
            $stmt->execute([
                ':uid' => $uid,
                ':cid' => $cid,
                ':name' => $name,
                ':email' => ($email === '' ? null : $email),
                ':hash' => password_hash($pwd, PASSWORD_DEFAULT),
            ]);
        } catch (PDOException $e) {
            if ((string)$e->getCode() === '23000') {
                $msg = strtolower($e->getMessage());
                if (str_contains($msg, "duplicate entry '0' for key 'primary'")) {
                    json_response(['success' => false, 'error' => 'Database schema issue: users.id must be AUTO_INCREMENT. Please run the latest schema update once, then retry.'], 409);
                }
                json_response(['success' => false, 'error' => 'ID or email exists'], 409);
            }
            throw $e;
        }

        $newUserId = (int)$this->pdo->lastInsertId();
        $this->audit->log($this->actorUserId(), 'superadmin_college_admin_created', [
            'user_id' => $newUserId,
            'unique_user_id' => $uid,
            'college_id' => $cid,
        ]);

        return [
            'success' => true,
            'user_id' => $newUserId,
            'unique_user_id' => $uid,
            'password' => $pwd,
        ];
    }

    private function actorUserId(): ?int
    {
        return isset($this->currentUser['id']) ? (int)$this->currentUser['id'] : null;
    }

    private function buildDefaultAdminName(string $collegeName): string
    {
        $base = trim($collegeName);
        if ($base === '') {
            return 'College Admin';
        }
        $base = substr($base, 0, 240);
        return $base . ' Admin';
    }

    private function cleanupLogoPath(?string $logoPath): void
    {
        if ($logoPath === null || !str_starts_with($logoPath, 'assets/uploads/college_logos/')) {
            return;
        }
        $abs = dirname(__DIR__, 3) . '/' . $logoPath;
        if (is_file($abs)) {
            @unlink($abs);
        }
    }
}
