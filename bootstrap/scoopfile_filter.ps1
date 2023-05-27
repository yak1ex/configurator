<#
 .Synopsis
  Filter scoopfile.json only necessary for 'scoop import'

 .Description
  The following actions are applied:
  - Delete .buckets[] | .Updated, .Manifests.
  - Delete .apps[] | .Version, .Updated.
  - Delete unreferenced .buckets[]

 .Example
  scoop export | .\scoopfile_filter.ps1
#>

$jqcmd = 
# check if no versions are explicitly specified
'if ([.apps[].Source == \"<auto-generated>\"] | any) then error(\"version specified\") else ' +
# collect source buckets
  '([.apps[].Source] | unique) as $sources |' +
# delete unreferenced buckets
  'del(.buckets[] | select(.Name | IN($sources[]) | not)) |' +
# delete unnecessary properties in buckets
  'del(.buckets[] | .Updated, .Manifests) |' +
# delete unnecessary properties in apps
'del(.apps[] | .Version, .Updated)' +
'end'

$input | jq $jqcmd