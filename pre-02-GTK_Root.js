const gtk_prefix = path.dirname(find_path('libgtk-win32-2.0-0.dll'));
exec(`npm config set GTK_Root ${path.normalize(gtk_prefix)}`);
