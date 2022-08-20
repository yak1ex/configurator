const gtk_prefix = path.dirname(find_path('libgtk-win32-2.0-0.dll'))
const gtk_root = path.normalize(gtk_prefix).replaceAll('\\','/')
exec(`npm config set GTK_Root=${gtk_root}`)
// I'm not sure the reason, but the above is not enough as of node-gyp@9.1.0
process.env["npm_config_GTK_Root"]=gtk_root
console.log(`env:npm_config_GTK_Root=${gtk_root}`)
