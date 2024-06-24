param(
  [switch]$pre,
  [switch]$post,
  [Parameter(Mandatory=$true)][string]$json,
  [string]$update
)

if (-not $pre -and -not $post -and $update -eq "") {
  Write-Host 'No option specified'
  return
}
$json_data = Get-Content $json | ConvertFrom-Json
if ($pre) {
  if ($update -eq "") {
    if ($json_data.pre_install) {
      Write-Host "Running pre_install script..."
      Invoke-Command ([scriptblock]::Create($json_data.pre_install -join "`r`n"))
    }
  } else {
    if ($json_data.pre_update.$update) {
      Write-Host "Running pre_update script for $update..."
      Invoke-Command ([scriptblock]::Create($json_data.pre_update.$update -join "`r`n"))
    }
  }
}
if ($post) {
  if ($update -eq "") {
    if ($json_data.post_install) {
      Write-Host "Running post_install script..."
      Invoke-Command ([scriptblock]::Create($json_data.post_install -join "`r`n"))
    }
  } else {
    if ($json_data.post_update.$update) {
      Write-Host "Running post_update script for $update..."
      Invoke-Command ([scriptblock]::Create($json_data.post_update.$update -join "`r`n"))
    }

  }
}