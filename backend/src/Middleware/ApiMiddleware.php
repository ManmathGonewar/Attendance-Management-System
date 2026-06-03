<?php

require_once __DIR__ . '/../Session.php';

class ApiMiddleware
{
    private SessionContext $sessionCtx;

    public function __construct(SessionContext $sessionCtx)
    {
        $this->sessionCtx = $sessionCtx;
    }

    public function requireRole(array $roles): void
    {
        Session::requireRole($this->sessionCtx, $roles);
    }

    public function requireMethod(string $method): void
    {
        require_method($method);
    }

    public function readJsonBody(): array
    {
        return read_json_body();
    }

    public function currentUser(): ?array
    {
        return $this->sessionCtx->currentUser;
    }
}
