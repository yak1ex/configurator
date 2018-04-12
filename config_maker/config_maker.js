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
  let files = await fs.readdirAsync(input)
console.log(input)

  files.filter(v => v.match(/\.js$/)).map(async filename => {
// collect phase
    const script = await fs.readFileAsync(path.join(input, filename))
    const context = Object.assign(origContext)
    vm.runInContext(script, context, { filename, displayErrors: true })
    console.log(context)

// create phase
    const dirname = filename.substring(0, filename.length - 3)
    const outdir = path.join(work, dirname)
    await fs.mkdirAsync(outdir)
    const files = await fs.readdirAsync(path.join(input, dirname))
    await Promise.all(files.map(async filename => {
      const encoding = match(filename, context.encoding, 'sjis')
      const buf = await fs.readFileAsync(path.join(input, dirname, filename))
      fs.writeFileAsync(path.join(outdir, filename), iconv.encode(Mustache.render(iconv.decode(buf, encoding), context), encoding))
    }))

// install phase
    const filesTemp = await fs.readdirAsync(path.join(work, dirname))
    filesTemp.map(async filename => {
      const instdir = match(filename, context.install)
      if(instdir) {
        const encoding = match(filename, context.encoding, 'sjis')
        const curr = path.join(instdir, filename)
        const temp = path.join(outdir, filename)
        const currContent = iconv.decode(await fs.readFileAsync(curr), encoding)
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
    })
  })

})() // invoking main

