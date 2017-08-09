const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs-extra'))
const path = require('path')
const vm = require('vm')
const iconv = require('iconv-lite')
const Mustache = require('mustache')

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

const [ input, temp ] = process.argv.slice(2, 4).map(v => path.join(__dirname, v))
const work = path.join(temp, '#work')
const context = make_context()

;(async function main() {

  await fs.removeAsync(work)
  await fs.mkdirpAsync(work)
  let files = await fs.readdirAsync(input)

  files.filter(v => v.match(/\.js$/)).map(async filename => {
// collect
    const script = await fs.readFileAsync(path.join(input, filename))
    vm.runInContext(script, context, { filename, displayErrors: true })
    console.log(context)

// create
    const dirname = filename.substring(0, filename.length - 3)
    const outdir = path.join(work, dirname)
    await fs.mkdirAsync(outdir)
    const files = await fs.readdirAsync(path.join(input, dirname))
    files.map(async filename => {
      const buf = await fs.readFileAsync(path.join(input, dirname, filename))
      // FIXME: encoding must be configurable
      const encoding = 'sjis'
      fs.writeFileAsync(path.join(outdir, filename), iconv.encode(Mustache.render(iconv.decode(buf, encoding), context), encoding))
    })
  })
})() // invoking main

// install phase
