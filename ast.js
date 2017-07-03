let make = require('./jsmake')
let util = require('util')

let code = `
a = $(b)
b = $(c)
c = hello
d = 1 $(a)$(a) $(z) 2 $(b) 3 $(dir /$(a)/foo) $a $() 4
`

let tokens = new make.FirstTokenizer(code).tokenize()
let parser = new make.Parser(tokens)
parser.parse()
let expander = new make.Expander(parser, make.Functions)
let ast = expander.parse(parser.vars.d)
console.log(util.inspect(ast, {depth:null}))
console.log('')
console.log(expander._expand(ast))
