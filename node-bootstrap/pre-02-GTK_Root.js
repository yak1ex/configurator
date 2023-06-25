const gtk_prefix = path.dirname(find_path('libgtk-win32-2.0-0.dll'))
const gtk_root = path.normalize(gtk_prefix).replaceAll('\\','/')
process.env["npm_config_GTK_Root"]=gtk_root
console.log(`env:npm_config_GTK_Root=${gtk_root}`)
