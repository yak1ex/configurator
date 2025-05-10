<#
.SYNOPSIS

Invoke and/or show script fragments in scoopfile.json

.DESCRIPTION

You can specify the following behaviour by parameters.

- Execute and/or Print scripts.
- Pre and/or Post scripts.
- Specify an app for Update.

.PARAMETER Pre

Specify pre parts as targets

.PARAMETER Post

Specify post parts as targets

.PARAMETER Print

Print and execute scripts

.PARAMETER PrintOnly

Print scripts only, not execute them

.PARAMETER Json

Specify an input JSON file

.PARAMETER Update

Specify update scripts as targets instead of install scripts.
A target app name should be specified.

#>

param(
  [switch]$pre,
  [switch]$post,
  [switch]$print,
  [switch]$printonly,
  [Parameter(Mandatory=$true)][string]$json,
  [string]$update
)

function invoke_command
{
  param(
    [switch]$print,
    [switch]$printonly,
    [string]$text
  )
  if ($print -or $printonly) {
    Write-Output $text
  }
  if (-not $printonly) {
    Invoke-Command ([scriptblock]::Create($text))
  }
}

if (-not $pre -and -not $post -and $update -eq "") {
  Write-Host 'No option specified'
  return
}
$json_data = Get-Content -Encoding UTF8 $json | ConvertFrom-Json
if ($pre) {
  if ($update -eq "") {
    if ($json_data.pre_install) {
      Write-Host "Running pre_install script..."
      invoke_command -Print:$print -PrintOnly:$printonly -Text ($json_data.pre_install -join "`r`n")
    }
  } else {
    if ($json_data.pre_update.$update) {
      Write-Host "Running pre_update script for $update..."
      invoke_command -Print:$print -PrintOnly:$printonly -Text ($json_data.pre_update.$update -join "`r`n")
    }
  }
}
if ($post) {
  if ($update -eq "") {
    if ($json_data.post_install) {
      Write-Host "Running post_install script..."
      invoke_command -Print:$print -PrintOnly:$printonly -Text ($json_data.post_install -join "`r`n")
    }
  } else {
    if ($json_data.post_update.$update) {
      Write-Host "Running post_update script for $update..."
      invoke_command -Print:$print -PrintOnly:$printonly -Text ($json_data.post_update.$update -join "`r`n")
    }

  }
}