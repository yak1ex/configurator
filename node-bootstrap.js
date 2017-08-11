#!/usr/bin/env node

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const child_process = require('child_process');

const bootstrap = JSON.parse(fs.readFileSync(path.join(__dirname, 'bootstrap.json')));
const files = fs.readdirSync(__dirname);

const pre = files.filter(x => x.match(/^pre-.*\.js$/)).sort();
const post = files.filter(x => x.match(/^post-.*\.js$/)).sort();

const exec = (command) => {
  console.log(command);
  child_process.execSync(command, { stdio: 'inherit' });
};
const exec_get = (command) => {
  // FIXME: Should handle Windows codepage by iconv-lite & chcp result
  return child_process.execSync(command, { encoding: 'ascii' });
}

const find_path = (target) => {
  for(let dir of process.env['PATH'].split(/;/)) {
    if(fs.existsSync(path.join(dir, target))) {
      return dir;
    }
  }
  return null;
}

const LENGTH = 1024 * 1024;

const copy = (src, dest) => {
  const rfd = fs.openSync(src, 'r');
  const rst = fs.fstatSync(rfd);
  const wfd = fs.openSync(dest, 'w', rst.mode);
  
  const buf = new Buffer(LENGTH)
  let read_bytes;
  do {
    read_bytes = fs.readSync(rfd, buf, 0, LENGTH)
    fs.writeSync(wfd, buf, 0, read_bytes);
  } while(read_bytes > 0);
  fs.futimesSync(wfd, rst.atime, rst.mtime);
  fs.closeSync(rfd);
  fs.closeSync(wfd);
};

const sandbox_base = {
  bootstrap, console, process, fs, path, exec, exec_get, find_path, copy
};

pre.forEach(filename => {
  const script = fs.readFileSync(path.join(__dirname, filename));
  const sandbox = Object.assign({}, sandbox_base);
  vm.runInNewContext(script, sandbox, { filename, displayErrors: true });
});

for(let key in bootstrap.dependencies) {
  let version = bootstrap.dependencies[key];
  let arg = '';
  if(typeof version === 'object') {
    arg = version.arg;
    version = version.version;
  }
  exec(`npm -g install ${arg} ${key}@${version}`);
}

post.forEach(filename => {
  const script = fs.readFileSync(path.join(__dirname, filename));
  const sandbox = Object.assign({}, sandbox_base);
  vm.runInNewContext(script, sandbox, { filename, displayErrors: true });
});
