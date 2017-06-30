#!/opt/bin/mocha --ui=tdd

'use strict';

let assert = require('assert')
let util = require('util')
let make = require('./jsmake')

suite('FirstTokenizer', function() {
    test('empty', function() {
	assert.deepEqual(new make.FirstTokenizer('').tokenize(), [])
    })

    test('newlines w/ backslashes', function() {
	let t = new make.FirstTokenizer(`
foo = bar \\
  baz = \\
a=b
c=d
`).tokenize().map( val => val.inspect())
	assert.deepEqual(t, [
            "id:foo:-:4:0:3",
            "op:=:-:4:4:4",
            "rvalue:bar   baz = a=b:-:4:5:20",
            "id:c:-:5:0:0",
            "op:=:-:5:1:1",
            "rvalue:d:-:5:2:2",
	])
    })

    test('vars', function() {
	let t = new make.FirstTokenizer(`
# a comment
foo = bar
foo =
`).tokenize().map( val => val.inspect())
	assert.deepEqual(t, [
            "comment:# a comment:-:2:0:10",
            "id:foo:-:3:0:3",
            "op:=:-:3:4:4",
            "rvalue:bar:-:3:5:8",
            "id:foo:-:4:0:3",
            "op:=:-:4:4:4",
	])
    })

    test('rules', function() {
	let t = new make.FirstTokenizer(`
$(f	oo):
bar: foo
	id
`).tokenize().map( val => val.inspect())
	assert.deepEqual(t, [
            "id:$(f\too):-:2:0:6",
            "op:::-:2:7:7",
            "id:bar:-:3:0:2",
            "op:::-:3:3:3",
            "rvalue:foo:-:3:4:7",
            "recipe:id:-:4:0:2",
	])
    })
})

suite('Parser', function() {
    test('empty', function() {
	let parser = new make.Parser([])
	parser.parse()
	assert.deepEqual(parser.vars, {})
	assert.deepEqual(parser.rules, [])
    })

    test('vars', function() {
	let tokens = new make.FirstTokenizer(`
foo = bar
foo =
baz=1
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	assert.deepEqual(parser.vars, {'foo': '', baz: 1})
	assert.deepEqual(parser.rules, [])
    })

    test('vars invalid', function() {
	let tokens = new make.FirstTokenizer(`
= bar
`).tokenize()
	let parser = new make.Parser(tokens)
	assert.throws( () => {
	    parser.parse()
	}, /unexpected op: =/)
    })

    test('rules', function() {
	let tokens = new make.FirstTokenizer(`
a:
b: c
	1
	2
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	assert.deepEqual(parser.vars, {})
	assert.deepEqual(parser.rules, [{
	    target: 'a'
	}, {
	    target: 'b',
	    deps: 'c',
	    recipes: [ "1", "2" ]
	}])
    })

        test('rules invalid', function() {
	let tokens = new make.FirstTokenizer(`
:
`).tokenize()
	let parser = new make.Parser(tokens)
	assert.throws( () => {
	    parser.parse()
	}, /unexpected op: :/)
    })

    test('rules invalid: a misplaced recipe', function() {
	let tokens = new make.FirstTokenizer(`
foo=
	hello
`).tokenize()
	let parser = new make.Parser(tokens)
	assert.throws( () => {
	    parser.parse()
	}, /unexpected recipe/)
    })

})

suite('Expander', function() {
    test('circle 1', function() {
	let tokens = new make.FirstTokenizer(`
q = $(w)
w = $(q)
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	assert.throws( () => {
	    new make.Expander(parser).expand()
	}, /var 'q' references itself/)
    })

    test('circle 2', function() {
	let tokens = new make.FirstTokenizer('q = $(q)').tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	assert.throws( () => {
	    new make.Expander(parser).expand()
	}, /var 'q' references itself/)
    })

    test('dir', function() {
	let tokens = new make.FirstTokenizer('q = q  $(dir /a/b)').tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	new make.Expander(parser, make.Functions).expand()
	assert.deepEqual(parser.vars, { q: 'q  /a/' })
    })

    test('refs', function() {
	let tokens = new make.FirstTokenizer(`
dirs = $(dir  /foo/bar    /home/bob) $(bar)   $(dir /etc/news)
bar = $(subst /qqq,/bar,-/qqq/www)

qqqq:
	@echo $(dirs)

q = name
$(q) = Bob $(bar)

$(q):
	@echo $(name)
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	new make.Expander(parser, make.Functions).expand()
	assert.deepEqual(parser.vars, {
            "bar": "-/bar/www",
            "dirs": "/foo/ /home/ -/bar/www   /etc/",
            "name": "Bob -/bar/www",
            "q": "name",
      	})
	assert.deepEqual(parser.rules, [
	    { target: 'qqqq', recipes: [ '@echo $(dirs)' ] },
	    { target: 'name', recipes: [ '@echo $(name)' ] } ])
    })

    test('deep recursions', function() {
	let tokens = new make.FirstTokenizer(`
f=1$(q$(w$(e))) $(e)
z:
	@echo '-$(f)-'
e=E
wE=WE
qWE=QWE
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	new make.Expander(parser, make.Functions).expand()
	assert.deepEqual(parser.vars, {
            "e": "E",
            "f": "1QWE E",
            "qWE": "QWE",
            "wE": "WE",
     	})
	assert.deepEqual(parser.rules, [
	    { target: 'z', recipes: [ "@echo '-$(f)-'" ] }
	])
    })

    test('func', function() {
	let tokens = new make.FirstTokenizer(`
b=$(z)
c=$(dir $(b))
d=$(dir /home$(b))
e=$(dir /home$(dir $(b))/john)
f=$(dir /home$(b)/john$(b)/bob/$(b)$(b)$(b)/1111/$(b))

z=/foo/bar
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	new make.Expander(parser, make.Functions).expand()
	assert.deepEqual(parser.vars, {
            "b": "/foo/bar",
            "c": "/foo/",
            "d": "/home/foo/",
            "e": "/home/foo//",
            "f": "/home/foo/bar/john/foo/bar/bob//foo/bar/foo/bar/foo/bar/1111//foo/",
            "z": "/foo/bar",
     	})
    })

})

suite('Functions', function() {
    test('dir', function() {
	assert.deepEqual(make.Functions.dir('/foo/bar /baz'), '/foo/ /')
    })
    test('subst', function() {
	assert.deepEqual(make.Functions.subst('ee', 'EE', 'feet on the street'), 'fEEt on the strEEt')
    })
})
