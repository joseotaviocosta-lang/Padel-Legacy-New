[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 5174,

    [ValidateRange(1, 60)]
    [int]$TimeoutSeconds = 10
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Get-ListeningProcessIds {
    param([int]$TargetPort)

    try {
        $connections = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction Stop
        return @($connections | ForEach-Object { [int]$_.OwningProcess } | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
    }
    catch {
        Write-Verbose "Get-NetTCPConnection indisponivel; usando netstat.exe. Motivo: $($_.Exception.Message)"
    }

    $escapedPort = [regex]::Escape([string]$TargetPort)
    $pattern = "^\s*TCP\s+\S+:$escapedPort\s+\S+\s+LISTENING\s+(\d+)\s*$"
    $processIds = foreach ($line in (& netstat.exe -ano -p tcp 2>$null)) {
        if ($line -match $pattern) { [int]$Matches[1] }
    }
    return @($processIds | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
}

function Get-ProcessDescription {
    param([int]$ProcessId)

    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $process) { return "PID $ProcessId (processo ja encerrado)" }

    $path = $null
    try { $path = $process.Path } catch { $path = $null }
    $suffix = if ($path) { " - $path" } else { '' }
    return "PID $ProcessId ($($process.ProcessName))$suffix"
}

try {
    $listeners = @(Get-ListeningProcessIds -TargetPort $Port)
    if ($listeners.Count -eq 0) {
        Write-Host "[dev-port] Porta $Port livre." -ForegroundColor Green
        exit 0
    }

    Write-Host "[dev-port] Porta $Port ocupada por $($listeners.Count) processo(s)." -ForegroundColor Yellow

    foreach ($processId in $listeners) {
        $description = Get-ProcessDescription -ProcessId $processId
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if (-not $process) {
            Write-Host "[dev-port] $description; nenhuma acao necessaria." -ForegroundColor DarkYellow
            continue
        }

        Write-Host "[dev-port] Encerrando somente $description..." -ForegroundColor Yellow
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
        }
        catch {
            Write-Error "Nao foi possivel encerrar $description. Abra o PowerShell como administrador ou execute: Stop-Process -Id $processId -Force. Detalhes: $($_.Exception.Message)"
            exit 1
        }
    }

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        Start-Sleep -Milliseconds 250
        $remaining = @(Get-ListeningProcessIds -TargetPort $Port)
        if ($remaining.Count -eq 0) {
            Write-Host "[dev-port] Porta $Port liberada." -ForegroundColor Green
            exit 0
        }
    } while ([DateTime]::UtcNow -lt $deadline)

    $details = ($remaining | ForEach-Object { Get-ProcessDescription -ProcessId $_ }) -join ', '
    Write-Error "Tempo limite de $TimeoutSeconds segundo(s): a porta $Port continua ocupada por $details. Comando manual: Stop-Process -Id $($remaining -join ',') -Force"
    exit 1
}
catch {
    Write-Error "Falha ao preparar a porta de desenvolvimento $Port. $($_.Exception.Message)"
    exit 1
}
