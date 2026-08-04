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

    $details = ($listeners | ForEach-Object { Get-ProcessDescription -ProcessId $_ }) -join ', '
    Write-Error "Porta $Port ja esta em uso por $details. O processo nao foi encerrado, para nao derrubar um servidor Vite ativo. Feche explicitamente a instancia antiga ou reutilize http://127.0.0.1:$Port/."
    exit 1
}
catch {
    Write-Error "Falha ao preparar a porta de desenvolvimento $Port. $($_.Exception.Message)"
    exit 1
}
