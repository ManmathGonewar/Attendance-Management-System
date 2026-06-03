<?php

declare(strict_types=1);

require_once __DIR__ . '/../backend/config/config.php';
require_once __DIR__ . '/../backend/src/Database.php';

/**
 * Convert legacy users.profile_photo_path file references into
 * users.profile_photo_data (data URL) so profile photos are fully DB-backed.
 *
 * Usage:
 *   php scripts/migrate_profile_photos_to_db.php
 *   php scripts/migrate_profile_photos_to_db.php --dry-run
 *   php scripts/migrate_profile_photos_to_db.php --delete-files
 */

$dryRun = in_array('--dry-run', $argv, true);
$deleteFiles = in_array('--delete-files', $argv, true);
$rootDir = dirname(__DIR__);

function detect_image_mime(string $binary): ?string
{
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->buffer($binary);
        if (is_string($mime) && $mime !== '') {
            return $mime;
        }
    }

    $imgInfo = @getimagesizefromstring($binary);
    if (is_array($imgInfo) && isset($imgInfo['mime']) && is_string($imgInfo['mime'])) {
        return $imgInfo['mime'];
    }

    return null;
}

try {
    $pdo = Database::getConnection();
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $pdo->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_data LONGTEXT NULL AFTER profile_photo_path");

    $sql = "SELECT id, unique_user_id, profile_photo_path
            FROM users
            WHERE profile_photo_path IS NOT NULL
              AND profile_photo_path <> ''
              AND (profile_photo_data IS NULL OR profile_photo_data = '')";
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    if (!$rows) {
        echo "No legacy profile photos found.\n";
        exit(0);
    }

    $allowed = [
        'image/png' => true,
        'image/jpeg' => true,
        'image/webp' => true,
    ];

    $migrated = 0;
    $skipped = 0;
    $deleted = 0;

    if (!$dryRun) {
        $pdo->beginTransaction();
    }

    $updateStmt = $pdo->prepare(
        "UPDATE users
         SET profile_photo_data = :photo_data,
             profile_photo_path = NULL
         WHERE id = :id"
    );

    foreach ($rows as $row) {
        $userId = (int)$row['id'];
        $uniqueId = (string)$row['unique_user_id'];
        $relativePath = (string)$row['profile_photo_path'];
        $absPath = $rootDir . '/' . ltrim($relativePath, '/');

        if (!is_file($absPath)) {
            $skipped++;
            echo "[skip] {$uniqueId} file_not_found {$relativePath}\n";
            continue;
        }

        $binary = file_get_contents($absPath);
        if (!is_string($binary) || $binary === '') {
            $skipped++;
            echo "[skip] {$uniqueId} file_read_failed {$relativePath}\n";
            continue;
        }

        $mime = detect_image_mime($binary);
        if ($mime === null || !isset($allowed[$mime])) {
            $skipped++;
            echo "[skip] {$uniqueId} unsupported_mime {$relativePath}\n";
            continue;
        }

        $dataUrl = 'data:' . $mime . ';base64,' . base64_encode($binary);

        if (!$dryRun) {
            $updateStmt->execute([
                ':photo_data' => $dataUrl,
                ':id' => $userId,
            ]);
        }

        $migrated++;
        echo "[ok] {$uniqueId} migrated {$relativePath}\n";

        if ($deleteFiles && !$dryRun) {
            if (@unlink($absPath)) {
                $deleted++;
            }
        }
    }

    if (!$dryRun) {
        $pdo->commit();
    }

    echo "Summary: migrated={$migrated} skipped={$skipped} deleted_files={$deleted} dry_run=" . ($dryRun ? 'yes' : 'no') . "\n";
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "Migration failed: " . $e->getMessage() . "\n");
    exit(1);
}

