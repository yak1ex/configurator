const gtk_prefix = path.dirname(find_path('libgtk-win32-2.0-0.dll'));
const target = path.join(process.env.npm_config_prefix, 'node_modules/canvas/build/Release');

if(!fs.existsSync(path.join(target, 'libfreetype-6.dll'))) {
  console.log('copy freetype6.dll');
  copy(path.join(gtk_prefix, 'bin/freetype6.dll'), path.join(target, 'freetype6.dll'));
}
