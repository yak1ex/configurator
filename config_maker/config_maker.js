const Mustache = require('mustache')

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
}

let make_counter = (init, minimum, pad) => new Proxy(new Counter(init, minimum, pad), {
  get: function(obj, prop) {
    return function (s) { // Here, 'this' might be used as context
      return obj[prop].call(obj, s)
    }
  }
})

let env_proxy = new Proxy({}, {
  get: function(obj, prop) {
    return process.env[prop.toUpperCase()];
  },
  has: function(obj, prop) { return prop.toUpperCase() in process.env },
  set: function(obj, prop, value) { return false; }
})

let count = 0;
let context = {
  counter: make_counter(5),
  env: env_proxy
};

//console.log(Mustache.render(
//`Test{{#counter}}{{incr}}{{/counter}}
//Test{{#counter}}{{incr}}{{/counter}}
//Test{{#counter}}{{keep}}{{/counter}}
//{{#counter}}{{#set}}3{{/set}}{{/counter}}Test{{#counter}}{{incr}}{{/counter}}
//Test{{#counter}}{{keep}}{{/counter}}={{{env.path}}}
//`,
//context
//))

console.log(Mustache.render(
`Test{{counter.incr}}
Test{{counter.incr}}
Test{{counter.keep}}
Test{{counter.incr}}
{{#counter.set}}3{{/counter.set}}Test{{counter.incr}}
Test{{counter.incr}}
Test{{counter.keep}}={{{env.path}}}
`,
context
))
