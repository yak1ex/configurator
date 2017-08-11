const libjpeg_turbo_prefix = path.dirname(find_path('jpeg62.dll'));
const gtk_prefix = path.dirname(find_path('libgtk-win32-2.0-0.dll'));
const targets = [
  'include/jconfig.h',
  'include/jerror.h',
  'include/jmorecfg.h',
  'include/jpeglib.h',
  'lib/jpeg.lib'
];
for(let file of targets) {
  console.log(`copying ${file}`);
  copy(path.join(libjpeg_turbo_prefix, file), path.join(gtk_prefix, file));
}
