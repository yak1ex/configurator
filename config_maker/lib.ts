import fs from 'fs-extra'
import child_process from 'node:child_process'
import path from 'node:path'
import util from 'node:util'
import vm from 'node:vm'
import readline from 'node:readline'
import iconv from 'iconv-lite'
import Mustache from 'mustache'
import minimatch from "minimatch"
import { mapTuple, assertType, isString } from './type-utils.js'

const exec = util.promisify(child_process.exec)

export class Counter {
  constructor (private value: number, private minimum: number, private pad: string = '0') {}
  keep () { let s = this.value.toString(); return this._pad(s) }
  incr () { let s = (this.value++).toString(); return this._pad(s) }
  set () {
    return (text: string, render: any) => {
      const next = Number.parseInt(text, 10)
      if (Number.isNaN(next)) {
        throw new TypeError(`Counter value must be a number, but got "${text}".`)
      }
      this.value = next
    }
  }
  private _pad (s: string) { return s.length < this.minimum ? this.pad.repeat(this.minimum - s.length)+s : s; }
  [Symbol.toPrimitive](hint: string) { if (hint === 'number') { return this.value++ } else { return this.incr() } }
}

type Spec = {
  app: string,
  context: vm.Context,
  files: string[],
}

export class ConfigMaker {
  private currDir: string
  private prevDir: string
  private stageDir: string
  private origContext: vm.Context
  private specs: Spec[] = []

  constructor(private inputDir: string, private tempDir: string) {
    ;[ this.currDir, this.prevDir, this.stageDir ] = mapTuple(['#curr', '#prev', '#stage'] as const, elem => path.join(tempDir, elem))
    this.origContext = this.make_context()
  }

  get_specs () : readonly Spec[] {
    return [...this.specs]
  }

  make_context () {

    // context binder for Mustache. It allows to call methods of Counter class in Mustache templates without losing "this" context.
    let make_counter = (init: number, minimum: number, pad: string) => new Proxy(
      new Counter(init, minimum, pad),
      {
        get: function(obj, prop) {
          if (typeof prop === 'symbol') return undefined
          assertType(prop, isString, 'Access to counter properties by NOT string key')
          if (prop in obj) {
            const value = obj[prop as keyof Counter]
            if (typeof value === 'function') {
              return value.bind(obj)
            } else {
              return value
            }
          } else {
            return undefined
          }
        },
        set: function(obj, prop, value) { return false; }
       }
    )
    //{{counter}} {{counter.incr}}
    //{{counter.keep}}
    //{{#counter.set}}3{{/counter.set}}

    const errorMessage = 'Access to environment variables by NOT string key'
    let env = new Proxy({}, {
      get: function(obj, prop) {
        if (typeof prop === 'symbol') return undefined
        assertType(prop, isString, errorMessage)
        return process.env[prop.toUpperCase()]
      },
      has: function(obj, prop) {
        if (typeof prop === 'symbol') return false
        assertType(prop, isString, errorMessage)
        return prop.toUpperCase() in process.env
      },
      set: function(obj, prop, value) { return false; }
    })

    let is_office: boolean = process.env['USERDOMAIN'] === 'DNJP'

    // FIXME: pf32, pf64

    let context_base = {
      make_counter, env, is_office, pf32: 'c:\\Program Files'
    };
    return context_base
  }

  question (query: string, opt: { choice?: string[], default?: string }) {
    return new Promise<string>((resolve, reject) => {
      const option = { ...opt }
      if (option.choice && option.choice.length === 0) {
        reject(new Error('Choice list must not be empty'))
        return
      }
      if (option.default !== undefined && option.choice && !option.choice.includes(option.default)) {
        reject(new Error('Default value must be included in choice list'))
        return
      }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      const cb = (answer: string) => {
        if(answer === '' && option.default !== undefined) answer = option.default
        if(!option.choice || option.choice.includes(answer)) {
          rl.close()
          resolve(answer)
        } else {
          rl.question(query, cb)
        }
      }
      rl.question(query, cb)
    })
  }

  match (filename: string, choice: [string,string][]|undefined) : string | undefined
  match (filename: string, choice: [string,string][]|undefined, defval: string) : string
  match (filename: string, choice: [string,string][]|undefined, defval?: string) {
    if (!choice) return defval
    const ret = choice.find(e => minimatch(filename, e[0]))
    return (ret !== undefined) ? ret[1] : defval
  }

  async collect()
  {
    const controlFiles = await fs.readdir(this.inputDir).then(elems => elems.filter(v => v.match(/\.js$/)))
    this.specs = await Promise.all(controlFiles.map(async controlFile => {
      const controlScript = await fs.readFile(path.join(this.inputDir, controlFile), 'utf-8')
      const context = vm.createContext(Object.assign({}, this.origContext))
      vm.runInContext(controlScript, context, { filename: controlFile, displayErrors: true })
      const app = path.basename(controlFile, '.js')
      const appDir = path.join(this.inputDir, app)
      const files = await fs.readdir(
        appDir,
        { 'encoding': 'utf8', 'recursive': true }
      ).then(async (entries) => {
        const checks = await Promise.all(
          (entries as string[]).map(async (relPath) => ({
            relPath,
            stat: await fs.stat(path.join(appDir, relPath)),
          }))
        )
        return checks.filter(({ stat }) => stat.isFile()).map(({ relPath }) => relPath)
      })
      return { app, context, files }
    }))
  }

  async prepare() {
    const isInit = ! await fs.exists(this.currDir)
    if (isInit) {
      await fs.mkdirp(this.stageDir)
      await exec(`git init ${this.stageDir}`)
      await exec('git commit --allow-empty -m "Initial commit (empty)."', {'cwd': this.stageDir})
      await exec('git switch -c work', {'cwd': this.stageDir})
      await exec('git switch -', {'cwd': this.stageDir})
      await exec(`git worktree add "${this.currDir}" work `, {'cwd': this.stageDir})
      await exec(`git clone -b work ${this.currDir} ${this.prevDir}`)
    }
    // Handle new configuration files
    const message = isInit ? "Initial import." : `Add empty placeholders on ${(new Date()).toLocaleString()}.`
    await Promise.all(this.specs.map(spec =>
      Promise.all(spec.files.map(file => {
        const instDir = this.match(file, spec.context.install)
        if(instDir) {
          return fs.ensureFile(path.join(instDir, file)).then(
            () => fs.ensureLink(path.join(instDir, file), path.join(this.stageDir, spec.app, file))
          )
        }
      }))
    ))
    await exec('git add .', {'cwd': this.stageDir})
    await exec(`git diff-index --quiet HEAD || git commit -m "${message}."`, {'cwd': this.stageDir})
  }

  getEncoding(file: string, context: { encoding?: [string,string][] }) : { encoding: string, bom: boolean } {
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
      await Promise.all(spec.files.map(async file => {
        const encoding = this.getEncoding(file, spec.context)
        const buf = await fs.readFile(path.join(this.inputDir, spec.app, file))
        const decodedBuf = iconv.decode(buf, encoding.encoding)
        const renderedBuf = Mustache.render(decodedBuf, spec.context)
        const encodedResult = iconv.encode(renderedBuf, encoding.encoding, { addBOM: encoding.bom })
        const outFile = path.join(outDir, file)
        await fs.ensureFile(outFile)
        await fs.writeFile(outFile, encodedResult)
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

  async getContent(targetPath: string) {
    try {
      return await fs.readFile(targetPath)
    } catch(e) {
      if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
        return
      }
      throw e
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