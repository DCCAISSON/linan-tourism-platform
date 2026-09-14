$ErrorActionPreference = 'Stop'

$repoRoot = (& git.exe rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
    throw 'The current directory is not inside a Git repository.'
}

Push-Location $repoRoot
try {
    $expectedConfig = @{
        'core.hooksPath' = '.githooks'
        'core.autocrlf' = 'false'
        'pull.ff' = 'only'
        'fetch.prune' = 'true'
        'commit.template' = '.gitmessage'
    }

    foreach ($entry in $expectedConfig.GetEnumerator()) {
        $actual = (& git.exe config --get $entry.Key)
        if ($actual -ne $entry.Value) {
            throw "Unexpected Git config: $($entry.Key)=$actual; expected $($entry.Value). Run npm run repo:setup first."
        }
    }

    $tracked = @(& git.exe ls-files)
    $blockedPattern = '(^|/)(\.env$|\.env\.(?!example$)|project\.private\.config\.json$|private/|data/|uploads/|exports/|backups/|secrets/)|\.(pem|key|p12|pfx|cer|crt|dump|bak)$'
    $blocked = @($tracked | Where-Object { $_ -match $blockedPattern })
    if ($blocked.Count -gt 0) {
        throw "Protected files are tracked: $($blocked -join ', ')"
    }

    $oversized = @()
    foreach ($file in $tracked) {
        $size = [int64](& git.exe cat-file -s ":$file" 2>$null)
        if ($LASTEXITCODE -eq 0 -and $size -gt 10MB) {
            $oversized += $file
        }
    }
    if ($oversized.Count -gt 0) {
        throw "Files larger than 10MB are tracked: $($oversized -join ', ')"
    }

    git.exe diff --check
    if ($LASTEXITCODE -ne 0) {
        throw 'The working tree whitespace check failed.'
    }
    git.exe diff --cached --check
    if ($LASTEXITCODE -ne 0) {
        throw 'The staged whitespace check failed.'
    }

    [pscustomobject]@{
        RepoRoot = $repoRoot
        Branch = (& git.exe branch --show-current)
        TrackedFiles = $tracked.Count
        BlockedFiles = $blocked.Count
        OversizedFiles = $oversized.Count
        Result = 'PASS'
    } | ConvertTo-Json -Compress
}
finally {
    Pop-Location
}
