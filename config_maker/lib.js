import fs from 'fs-extra'
import child_process from 'node:child_process'
import path from 'node:path'
import util from 'node:util'
import vm from 'node:vm'
import readline from 'node:readline'
import iconv from 'iconv-lite'
import Mustache from 'mustache'
import minimatch from "minimatch"

const exec = util.promisify(child_process.exec)

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

const ConfigMaker = class {
  constructor(inputDir, tempDir) {
    this.inputDir = inputDir
    this.tempDir = tempDir
    ;[ this.currDir, this.prevDir, this.stageDir ] = ['#curr', '#prev', '#stage'].map(elem => path.join(tempDir, elem))
    this.origContext = this.make_context()
  }

  make_context () {

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

  question = (query, opt) => new Promise((resolve, reject) => {
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

  match = (filename, choice, defval) => {
    if (!choice) return defval
    const ret = choice.find(e => minimatch(filename, e[0]))
    return (ret !== undefined) ? ret[1] : defval
  }

  async collect()
  {
    const controlFiles = await fs.readdir(this.inputDir).then(elems => elems.filter(v => v.match(/\.js$/)))
    this.specs = await Promise.all(controlFiles.map(async controlFile => {
      const controlScript = await fs.readFile(path.join(this.inputDir, controlFile))
      const context = vm.createContext(Object.assign({}, this.origContext))
      vm.runInContext(controlScript, context, { filename: controlFile, displayErrors: true })
      const app = path.basename(controlFile, '.js')
      const files = await fs.readdir(path.join(this.inputDir, app), {'recursive': true})
      return { app, context, files }
    }))
  }

  async prepare() {
    const isInit = await fs.exists(this.currDir)
    if (!isInit) {
      await fs.mkdirp(this.stageDir)
      await exec(`git init ${this.stageDir}`)
      await exec('git commit --allow-empty -m "Initial commit (empty)."', {'cwd': this.stageDir})
      await exec('git switch -c work', {'cwd': this.stageDir})
      await exec('git switch -', {'cwd': this.stageDir})
      await exec(`git worktree add "${this.currDir}" work `, {'cwd': this.stageDir})
      await Promise.all(this.specs.map(spec =>
        Promise.all(spec.files.map(file => {
          const instDir = match(file, spec.context.install)
          if(instDir) {
            return fs.ensureLink(path.join(instDir, file), path.join(this.stageDir, spec.app, file))
          }
        }))
      ))
      await exec('git add .', {'cwd': this.stageDir})
      await exec('git commit -m "Initial import."', {'cwd': this.stageDir})
      await exec(`git clone -b work ${this.currDir} ${this.prevDir}`)
    }
  }

  getEncoding(file, context) {
    const encoding = this.match(file, context.encoding, 'sjis')
    if (encoding === 'utf8-bom') {
      return { encoding: 'utf8', bom: true }
    } else {
      return { encoding, bom: false }
    }
  }

  async generate() {
    return Promise.all(this.specs.map(async spec => {
      const outDir = path.join(this.currDir, spec.app)
      await fs.mkdirp(outDir)
      return Promise.all(spec.files.map(async file => {
        const encoding = this.getEncoding(file, spec.context)
        const buf = await fs.readFile(path.join(this.inputDir, spec.app, file))
        const decodedBuf = iconv.decode(buf, encoding.encoding)
        const renderedBuf = Mustache.render(decodedBuf, spec.context)
        const encodedResult = iconv.encode(renderedBuf, encoding.encoding, { addBOM: encoding.bom })
        const outFile = path.join(outDir, file)
        await fs.ensureFile(outFile)
        fs.writeFile(outFile, encodedResult)
      }))
    }))
  }

  async update() {
    await exec('git add .', {'cwd': this.currDir})
    const dateTime = (new Date()).toLocaleString()
    await exec(`git diff-index --quiet HEAD || git commit -m "Update from template on ${dateTime}."`, {'cwd': this.currDir})
    const { stdout: hash } = await exec('git rev-parse "HEAD^"', {'cwd': this.currDir})
    await exec('git fetch', {'cwd': this.prevDir})
    console.log(hash)
    await exec(`git clean -df`, {'cwd': this.prevDir})
    await exec(`git checkout ${hash}`, {'cwd': this.prevDir})
  }

  async getContent(targetPath) {
    try {
      return await fs.readFile(targetPath)
    } catch(e) {
      return
    }
  }

  async install() {
    const targets = await Promise.all(this.specs.map(async spec =>
      await Promise.all(spec.files.map(async file => {
        const currPath = path.join(this.currDir, spec.app, file)
        const currBuf = await this.getContent(currPath)
        const prevPath = path.join(this.prevDir, spec.app, file)
        const prevBuf = await this.getContent(prevPath)
        if (prevBuf === undefined) {
          await fs.ensureFile(prevPath)
        }
        if (prevBuf && currBuf && currBuf.compare(prevBuf) === 0) {
          console.log(`${spec.app}/${file}: prev and curr is identical, skip`)
        } else {
          const stagePath = path.join(this.stageDir, spec.app, file)
          const stageBuf = await this.getContent(stagePath)
          if (currBuf && stageBuf && currBuf.compare(stageBuf) === 0) {
            console.log(`${spec.app}/${file}: stage and curr is identical, skip`)
          } else {
            return { prevPath, currPath, stagePath }
          }
        }
      }))
    ))
    //console.log(targets)
    targets.filter(target => target !== undefined).forEach(target =>
      target.filter(paths => paths !== undefined).forEach(paths =>
        child_process.execSync(`winmergeu ${paths.prevPath} ${paths.currPath} ${paths.stagePath}`)
      )
    )
  }

}
export default ConfigMaker;