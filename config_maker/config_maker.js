import fs from 'fs-extra'
import path from 'node:path'
import clArgs from 'command-line-args'
import clUsage from 'command-line-usage'
import { fileURLToPath } from "node:url";
import ConfigMaker from './lib.js'

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
  const noargs = options.input === undefined || !fs.statSync(options.input, { throwIfNoEntry: false })?.isDirectory() || options.output === undefined
  if (options.help || noargs) {
    if (noargs) {
      console.log('input and output are mandatory options and input directory must exist')
    }
    const usage = clUsage([
      {
        header: 'Config Maker',
        content: 'generatates configuration files from templates, compare with current files and manage them under git control'
      },
      {
        header: 'Synopsis',
        content: [
          '> node config_maker.js -input \\#conf -output \\#work',
        ]
      },
      {
        header: 'Options',
        optionList: optionDef
      },
      {
        header: 'Folders',
        content: [
          'All the follwing folders are version-controled by git.',
          'work/#prev: The previous state for files generated from templates.',
          'work/#curr: The current state for files generated from templates.',
          'work/#stage: Staging folder includes hardlinks to actual configuraiton files.'
        ]
      }
    ])
    console.log(usage)
    return
  }
  const [ inputDir, tempDir ] = [ options.input, options.output ].map(v => path.join(my_dirname(), v))
  const configMaker = new ConfigMaker(inputDir, tempDir)
  
  await configMaker.collect()
  console.log(configMaker.specs)
  await configMaker.prepare()
  await configMaker.generate()
  await configMaker.update()
  await configMaker.install()
  // rollback() or commit()
})() // invoking main

