<#
 .Synopsis
  Remove apps in the latter scoopfile.json content, from the former scoopfile.json content.

 .Description
  Remove apps in the latter scoopfile.json content, from the former scoopfile.json content.
  Equivalence check is based on Name property.

 .Example
  (scoop export), (Get-Content .\scoopfile.base.json) | .\scoopfile_diff.ps1
#>

$jqcmd =
# Stored latter JSON apps part
'.[1].apps as $exist |' +
# Remove apps existing in latter part
'del(.[0].apps[] | select(.Name | IN($exist[].Name))) |' +
# Output the former part
'.[0]'

$input | jq -s $jqcmd