/* global console, exec, find_path, path */
const dll = 'jpeg62.dll'
const dllPath = find_path(dll)
if (dllPath === null) {
  console.log(`${dll} is not found`)
} else {
  const libjpegTurboPrefix = path.dirname(dllPath)
  jpeg_root = path.normalize(libjpegTurboPrefix).replaceAll('\\', '/')
  process.env["npm_config_jpeg_root"] = jpeg_root
  console.log(`env:npm_config_jpeg_root=${jpeg_root}`)
}
