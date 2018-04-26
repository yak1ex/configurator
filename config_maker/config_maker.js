const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs-extra'))
const path = require('path')
const vm = require('vm')
const readline = require('readline')
const iconv = require('iconv-lite')
const Mustache = require('mustache')
const JsDiff = require('diff')
const minimatch = require("minimatch")

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
  return vm.createContext(context_base)
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

const readdirRecur = (dir, cb) => {
  const result = []
  const process = (target, base) => fs.readdirAsync(path.join(base, target)).map(e =>
    fs.statAsync(path.join(base, target, e)).then(st => {
      if(st.isDirectory()) {
        return process(path.join(target, e), base)
      } else {
        result.push(target === '.' ? e : path.join(target, e))
      }
    })).all()
  process('.', dir).then(() => cb(null, result)).catch(e => cb(e))
}
const readdirRecurAsync = Promise.promisify(readdirRecur)

const match = (filename, choice, defval) => {
  if (!choice) return defval
  const ret = choice.find(e => minimatch(filename, e[0]))
  return (ret !== undefined) ? ret[1] : defval
}

const [ input, temp ] = process.argv.slice(2, 4).map(v => path.join(__dirname, v))
const work = path.join(temp, '#work')
const origContext = make_context()

;(async function main() {

  await fs.removeAsync(work)
  await fs.mkdirpAsync(work)

  fs.readdirAsync(input).filter(v => v.match(/\.js$/)).mapSeries(async filename => {
// collect phase
    const script = await fs.readFileAsync(path.join(input, filename))
    const context = Object.assign(origContext)
    vm.runInContext(script, context, { filename, displayErrors: true })
    console.log(context)

// create phase
    const dirname = filename.substring(0, filename.length - 3)
    const outdir = path.join(work, dirname)
    await fs.mkdirAsync(outdir)
    await readdirRecurAsync(path.join(input, dirname)).map(async filename => {
      const encoding = match(filename, context.encoding, 'sjis')
      const buf = await fs.readFileAsync(path.join(input, dirname, filename))
      await fs.ensureFileAsync(path.join(outdir, filename))
      fs.writeFileAsync(path.join(outdir, filename), iconv.encode(Mustache.render(iconv.decode(buf, encoding), context), encoding))
    }).all()

// install phase
    return readdirRecurAsync(path.join(work, dirname)).mapSeries(async filename => {
      const instdir = match(filename, context.install)
      if(instdir) {
        const encoding = match(filename, context.encoding, 'sjis')
        const curr = path.join(instdir, path.basename(filename))
        const temp = path.join(outdir, filename)
        const newFile = !fs.existsSync(curr)
        const currContent = newFile ? '' : iconv.decode(await fs.readFileAsync(curr), encoding)
        const tempContent = iconv.decode(await fs.readFileAsync(temp), encoding)
        console.log(JsDiff.createTwoFilesPatch(curr, temp, currContent, tempContent))
        if (currContent === tempContent) {
          console.log('No differences, skip')
        } else {
          return question('apply Y/[N]? ', { choice: ['Y','N'], default: 'N' }).then(answer => {
            if(answer === 'Y') {
              fs.copyAsync(temp, curr)
            }
          })
        }
      }
    }).all()
  })

})() // invoking main

