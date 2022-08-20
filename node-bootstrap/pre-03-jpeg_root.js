const libjpeg_turbo_prefix = path.dirname(find_path('jpeg62.dll'))
exec(`npm config set jpeg_root=${path.normalize(libjpeg_turbo_prefix).replaceAll('\\','/')}`)
