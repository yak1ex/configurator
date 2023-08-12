$json = Get-Content $args[0] | ConvertFrom-Json
if ($json.post_install) {
  Write-Host "Running post_install script..."
  Invoke-Command ([scriptblock]::Create($json.post_install -join "`r`n"))
}
