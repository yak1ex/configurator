import fs from 'fs-extra'
import child_process from 'node:child_process'
import path from 'node:path'
import util from 'node:util'
import vm from 'node:vm'
import readline from 'node:readline'
import iconv from 'iconv-lite'
import Mustache from 'mustache'
import minimatch from "minimatch"
import clArgs from 'command-line-args'
import clUsage from 'command-line-usage'
import { fileURLToPath } from "node:url";

const exec = util.promisify(child_process.exec)

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

async function collect(inputDir, origContext)
{
  const controlFiles = await fs.readdir(inputDir).then(elems => elems.filter(v => v.match(/\.js$/)))
  return Promise.all(controlFiles.map(async controlFile => {
    const controlScript = await fs.readFile(path.join(inputDir, controlFile))
    const context = vm.createContext(Object.assign({}, origContext))
    vm.runInContext(controlScript, context, { filename: controlFile, displayErrors: true })
    const app = path.basename(controlFile, '.js')
    const files = await fs.readdir(path.join(inputDir, app), {'recursive': true})
    return { app, context, files }
  }))
}

async function prepare(specs, prevDir, currDir, stageDir) {
  const isInit = await fs.exists(currDir)
  if (!isInit) {
    await fs.mkdirp(stageDir)
    await exec(`git init ${stageDir}`)
    await exec('git commit --allow-empty -m "Initial commit (empty)."', {'cwd': stageDir})
    await exec('git switch -c work', {'cwd': stageDir})
    await exec('git switch -', {'cwd': stageDir})
    await exec(`git worktree add "${currDir}" work `, {'cwd': stageDir})
    await Promise.all(specs.map(spec =>
      Promise.all(spec.files.map(file => {
        const instDir = match(file, spec.context.install)
        if(instDir) {
          return fs.ensureLink(path.join(instDir, file), path.join(stageDir, spec.app, file))
        }
      }))
    ))
    await exec('git add .', {'cwd': stageDir})
    await exec('git commit -m "Initial import."', {'cwd': stageDir})
    await exec(`git clone -b work ${currDir} ${prevDir}`)
  }
}

function getEncoding(file, context) {
  const encoding = match(file, context.encoding, 'sjis')
  if (encoding === 'utf8-bom') {
    return { encoding: 'utf8', bom: true }
  } else {
    return { encoding, bom: false }
  }
}

async function generate(specs, inputDir, currDir) {
  return Promise.all(specs.map(async spec => {
    const outDir = path.join(currDir, spec.app)
    await fs.mkdirp(outDir)
    return Promise.all(spec.files.map(async file => {
      const encoding = getEncoding(file, spec.context)
      const buf = await fs.readFile(path.join(inputDir, spec.app, file))
      const decodedBuf = iconv.decode(buf, encoding.encoding)
      const renderedBuf = Mustache.render(decodedBuf, spec.context)
      const encodedResult = iconv.encode(renderedBuf, encoding.encoding, { addBOM: encoding.bom })
      const outFile = path.join(outDir, file)
      await fs.ensureFile(outFile)
      fs.writeFile(outFile, encodedResult)
    }))
  }))
}

async function update(specs, prevDir, currDir) {
  await exec('git add .', {'cwd': currDir})
  const dateTime = (new Date()).toLocaleString()
  await exec(`git diff-index --quiet HEAD || git commit -m "Update from template on ${dateTime}."`, {'cwd': currDir})
  const { stdout: hash } = await exec('git rev-parse "HEAD^"', {'cwd': currDir})
  await exec('git fetch', {'cwd': prevDir})
  console.log(hash)
  await exec(`git clean -df`, {'cwd': prevDir})
  await exec(`git checkout ${hash}`, {'cwd': prevDir})
}

async function getContent(targetPath) {
  try {
    return await fs.readFile(targetPath)
  } catch(e) {
    return
  }
}

async function install(specs, prevDir, currDir, stageDir) {
  const targets = await Promise.all(specs.map(async spec =>
    await Promise.all(spec.files.map(async file => {
      const currPath = path.join(currDir, spec.app, file)
      const currBuf = await getContent(currPath)
      const prevPath = path.join(prevDir, spec.app, file)
      const prevBuf = await getContent(prevPath)
      if (prevBuf === undefined) {
        await fs.ensureFile(prevPath)
      }
      if (prevBuf && currBuf && currBuf.compare(prevBuf) === 0) {
        console.log(`${spec.app}/${file}: prev and curr is identical, skip`)
      } else {
        const stagePath = path.join(stageDir, spec.app, file)
        const stageBuf = await getContent(stagePath)
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

// ref. https://zenn.dev/risu729/articles/dirname-in-esm
function my_dirname() {
  if('dirname' in import.meta) {
    return import.meta.dirname
  } else {
    const filename = fileURLToPath(import.meta.url)
    return path.dirname(filename)
  }
}

;(async function main() {
  const optionDef = [
    { name: 'input', alias: 'i', type: String, description: 'input folder including configuration templates' },
    { name: 'output', alias: 'o', type: String, description: 'output folder including #curr/#prev/#stage' },
    { name: 'help', alias: 'h', type: Boolean, description: 'Display this usage guide' }
  ]

  const options = clArgs(optionDef)
  if (options.help) {
    const usage = clUsage([
      {
        header: 'Config Maker',
        content: 'generatates configuration files from templates, compare with current files and manage them under git control'
      },
      {
        header: 'Synopsis',
        content: [
          '> node config_maker.js \\#conf \\#work',
        ]
      },
      {
        header: 'Options',
        optionList: optionDef
      }
    ])
    console.log(usage)
    return
  }
  const [ inputDir, tempDir ] = [ options.input, options.output ].map(v => path.join(my_dirname(), v))
  const [ currDir, prevDir, stageDir ] = ['#curr', '#prev', '#stage'].map(elem => path.join(tempDir, elem))
  const origContext = make_context()
  
  const specs = await collect(inputDir, origContext)
  console.log(specs)
  await prepare(specs, prevDir, currDir, stageDir)
  await generate(specs, inputDir, currDir)
  await update(specs, prevDir, currDir)
  await install(specs, prevDir, currDir, stageDir)
  // rollback() or commit()
})() // invoking main

