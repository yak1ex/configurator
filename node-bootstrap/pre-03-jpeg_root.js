/* global console, exec, find_path, path */
const dll = 'jpeg62.dll'
const dllPath = find_path(dll)
if (dllPath === null) {
  console.log(`${dll} is not found`)
} else {
  const libjpegTurboPrefix = path.dirname(dllPath)
  exec(`npm config set jpeg_root=${path.normalize(libjpegTurboPrefix).replaceAll('\\', '/')}`)
}
