process.env['NO_UPDATE_NOTIFIER'] = 'TRUE' // without this, executing npm is blocked
const gtk_prefix = path.dirname(find_path('libgtk-win32-2.0-0.dll'));
const npm_prefix = exec_get('npm config get prefix').trim()
const target = path.join(npm_prefix, 'node_modules/canvas/build/Release');

if(!fs.existsSync(path.join(target, 'libfreetype-6.dll'))) {
  console.log('copy libfreetype-6.dll');
  copy(path.join(gtk_prefix, 'bin/libfreetype-6.dll'), path.join(target, 'libfreetype-6.dll'));
}
