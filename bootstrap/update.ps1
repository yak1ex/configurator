$v1=$false
$v2=$false

Get-Content .\bootstrap.ps1 |
  Out-String -stream |
  Where-Object {
    $v1 = $v1 -or $_ -match "@'"
    $v2 = $v2 -or $_ -match "'@"
    return -not $v1 -or $v2
  } |
  ForEach-Object {
    If($_ -match "'@") {
      return "`$yaksetup_content=@'`r`n"+(Get-Content 'YakSetup.psm1'|Out-String)+"'@";
    } else {
      return $_
    }
  } |
  Out-File -Encoding Default -FilePath bootstrap.ps1.new

Move-Item -force .\bootstrap.ps1.new .\bootstrap.ps1
