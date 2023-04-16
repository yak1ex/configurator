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

scoop export | jq $jqcmd