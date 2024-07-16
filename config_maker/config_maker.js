import fs from 'fs-extra'
import child_process from 'node:child_process'
import path from 'node:path'
import vm from 'node:vm'
import readline from 'node:readline'
import iconv from 'iconv-lite'
import Mustache from 'mustache'
import JsDiff from 'diff'
import minimatch from "minimatch"

function make_context () {
  const Counter = class {
    constructor (init, minimum, pad) {
      this.value = init
      this.minimum = minimum
      this.pad = pad !== undefined ? pad : '0';
    }
    keep () { let s = this.value.toString(); return this._pad(s) }
    incr () { let s = (this.value++).toString(); return this._pad(s) }
    set () { return (text, render) => { this.value = parseInt(text) } }
    _pad (s) { return s.length < this.minimum ? this.pad.repeat(this.minimum - s.length)+s : s; }
    [Symbol.toPrimitive](hint) { if (hint === 'number') { return this.value++ } else { return this.incr() } }
  }

  let make_counter = (init, minimum, pad) => new Proxy(new Counter(init, minimum, pad), {
    get: function(obj, prop) {
      if(obj.hasOwnProperty(prop) && typeof obj[prop] === 'function') {
        return function (s) { // Here, 'this' might be used as context
          return obj[prop].call(obj, s)
        }
      } else return obj[prop]
    }
  })
  //{{counter}} {{counter.incr}}
  //{{counter.keep}}
  //{{#counter.set}}3{{/counter.set}}

  let env = new Proxy({}, {
    get: function(obj, prop) {
      return typeof prop === 'string' ? process.env[prop.toUpperCase()] : obj[prop]
    },
    has: function(obj, prop) { return typeof prop === 'string' ? prop.toUpperCase() in process.env : prop in obj },
    set: function(obj, prop, value) { return false; }
  })

  let is_office = process.env['USERDOMAIN'] === 'DNJP'

  // FIXME: pf32, pf64

  let context_base = {
    make_counter, env, is_office, pf32: 'c:\\Program Files'
  };
  return context_base
}

const question = (query, opt) => new Promise((resolve, reject) => {
  const option = Object.assign({ choice: [] }, opt)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const cb = (answer) => {
    if(answer === '' && 'default' in option) answer = option.default
    if(option.choice.includes(answer)) {
      rl.close()
      resolve(answer)
    } else {
      rl.question(query, cb)
    }
  }
  rl.question(query, cb)
})

const match = (filename, choice, defval) => {
  if (!choice) return defval
  const ret = choice.find(e => minimatch(filename, e[0]))
  return (ret !== undefined) ? ret[1] : defval
}

const [ input, temp ] = process.argv.slice(2, 4).map(v => path.join(import.meta.dirname, v))
const [ currDir, prevDir, stageDir ] = ['#curr', '#prev', '#stage'].map(elem => path.join(temp, elem))
const origContext = make_context()

;(async function main() {

  await fs.remove(currDir)
  await fs.mkdirp(currDir)
  // [setup]
  // if(init) {
  //   git init {stageDir}
  //   at stageDir: git commit --allow-empty -m 'Initial commit.'
  //   at stageDir: git worktree add '../#curr' work
  //   at stageDir: hardlink from target
  // }

  await fs.readdir(input).then(elems => elems.filter(v => v.match(/\.js$/))).then(elems => elems.reduce(
    async (prev, filename) => {
      await prev // force sequential executaion

      // collect phase
      const script = await fs.readFile(path.join(input, filename))
      const context = vm.createContext(Object.assign({}, origContext))
      vm.runInContext(script, context, { filename, displayErrors: true })
      console.log(context)
      // { appname: { context, 'targets': [target_files] } }

      // create phase
      const dirname = filename.substring(0, filename.length - 3) // strip extension .js
      const outdir = path.join(currDir, dirname)
      await fs.mkdir(outdir)
      await Promise.all(await fs.readdir(path.join(input, dirname), {'recursive': true}).then(elems=>elems.map(async filename => {
        const encoding = match(filename, context.encoding, 'sjis')
        const buf = await fs.readFile(path.join(input, dirname, filename))
        await fs.ensureFile(path.join(outdir, filename))
        fs.writeFile(path.join(outdir, filename), iconv.encode(Mustache.render(iconv.decode(buf, encoding), context), encoding))
      })))
      // [after all files processed]
      // git add .
      // git commit -m 'Update from template on yyyymmdd'
      // hash=`git rev-parse HEAD^`
      // if(init) {
      //   git clone -b work {currDir} {prevDir}
      // } else {
      //   at prevDir: git fetch
      // }
      // at prevDir: git checkout {hash}

      // install phase
      await fs.readdir(path.join(currDir, dirname), {'recursive': true}).then(elems => elems.reduce(async (prev, filename) => {
        await prev // force sequential executaion
        const instdir = match(filename, context.install)
        if(instdir) {
          const encoding = match(filename, context.encoding, 'sjis')
          const curr = path.join(instdir, path.basename(filename))
          const temp = path.join(outdir, filename)
          const newFile = ! await fs.exists(curr)
          const currContent = newFile ? '' : iconv.decode(await fs.readFile(curr), encoding)
          const tempContent = iconv.decode(await fs.readFile(temp), encoding)
          console.log(JsDiff.createTwoFilesPatch(curr, temp, currContent, tempContent))
          if (currContent === tempContent) {
            console.log('No differences, skip')
          } else {
            return question('apply Y/[N]? ', { choice: ['Y','N'], default: 'N' }).then(answer => {
              if(answer === 'Y') {
                fs.copy(temp, curr)
              }
            })
          }
        }
      }, Promise.resolve()))
    }, Promise.resolve()))

})() // invoking main

