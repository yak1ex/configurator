# README

## Configuration structure

```
<name>.js
<name>/
  <mustache files>...
```

`<name>.js` is invoked at first to make context, then mustache files are processed according to the made context.

## Context

### Pre-defined context

- `env`: A hash for environment variables.
- `is_office`: A bool flag whether it is on office domain.
- `make_counter(init, minimum, pad='0')`: Returns a counter with the specified initial value, minimum width and padding.
- `pf32`: `Program Files` for 32bit apps.

### Control context

- `encoding`: `[[<glob pattern>, <iconv-lite encoding>],...]` A matcher list for encoding.
- `install`: `[[<glob pattern>, <install folder>],...]` A matcher list for install location.

## NOTES for environment variables

### Program Files

#### env['PROCESSOR_ARCHITECTURE'] == 'AMD64'

##### 64bit process

- env['ProgramFiles']      expects 'C:\\Program Files'
- env['ProgramFiles(x86)'] expects 'C:\\Program Files (x86)'
- env['ProgramW6432']      expects 'C:\\Program Files'

##### 32bit process

- env['ProgramFiles']      expects 'C:\\Program Files (x86)'
- env['ProgramFiles(x86)'] expects 'C:\\Program Files (x86)'
- env['ProgramW6432']      expects 'C:\\Program Files'

#### env['PROCESSOR_ARCHITECTURE'] == 'x86'

- env['ProgramFiles']      expects 'C:\Program Files'
