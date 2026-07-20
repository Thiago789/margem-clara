$ErrorActionPreference = "Stop"

function ConvertTo-PlainText {
  param([Security.SecureString]$SecureValue)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

$name = Read-Host "Nome do administrador"
$email = Read-Host "E-mail do administrador"
$securePassword = Read-Host "Senha (minimo de 16 caracteres)" -AsSecureString
$plainPassword = ConvertTo-PlainText $securePassword

try {
  $env:BOOTSTRAP_ADMIN_NAME = $name
  $env:BOOTSTRAP_ADMIN_EMAIL = $email
  $env:BOOTSTRAP_ADMIN_PASSWORD = $plainPassword

  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($pnpm) {
    & $pnpm.Source admin:bootstrap
    exit $LASTEXITCODE
  }

  $node = Get-ChildItem "$HOME\.cache\codex-runtimes" -Recurse -Filter node.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "dependencies\\node\\bin\\node.exe$" } |
    Select-Object -First 1
  $pnpmScript = Get-ChildItem "$HOME\.cache\codex-runtimes" -Recurse -Filter pnpm.cjs -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "node_modules\\pnpm\\bin\\pnpm.cjs$" } |
    Select-Object -First 1

  if (-not $node -or -not $pnpmScript) {
    throw "Node.js/pnpm nao encontrado. Instale Node.js 22 e habilite o Corepack."
  }

  & $node.FullName $pnpmScript.FullName admin:bootstrap
  exit $LASTEXITCODE
}
finally {
  $env:BOOTSTRAP_ADMIN_NAME = $null
  $env:BOOTSTRAP_ADMIN_EMAIL = $null
  $env:BOOTSTRAP_ADMIN_PASSWORD = $null
  $plainPassword = $null
  $securePassword.Dispose()
}
