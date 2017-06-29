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
	assert.deepEqual(new make.FirstTokenizer(`
foo = bar \\
  baz = \\
a=b
c=d
`).tokenize(), [{
    "pos": "4:0:3",
    "type": "identifier",
    "val": "foo",
}, {
    "pos": "4:4:4",
    "type": "op",
    "val": "=",
}, {
    "pos": "4:5:20",
    "type": "rvalue",
    "val": "bar   baz = a=b",
}, {
    "pos": "5:0:0",
    "type": "identifier",
    "val": "c",
}, {
    "pos": "5:1:1",
    "type": "op",
    "val": "=",
}, {
    "pos": "5:2:2",
    "type": "rvalue",
    "val": "d",
}])
    })

    test('vars', function() {
	assert.deepEqual(new make.FirstTokenizer(`
# a comment
foo = bar
foo =
`).tokenize(), [{
    "pos": "2:0:10",
    "type": "comment",
    "val": "# a comment"
}, {
    "pos": "3:0:3",
    "type": "identifier",
    "val": "foo"
}, {
    "pos": "3:4:4",
    "type": "op",
    "val": "="
}, {
    "pos": "3:5:8",
    "type": "rvalue",
    "val": "bar"
}, {
    "pos": "4:0:3",
    "type": "identifier",
    "val": "foo",
}, {
    "pos": "4:4:4",
    "type": "op",
    "val": "="
}])
    })

    test('rules', function() {
	assert.deepEqual(new make.FirstTokenizer(`
$(f	oo):
bar: foo
	id
`).tokenize(), [{
    "pos": "2:0:6",
    "type": "identifier",
    "val": "$(f	oo)"
}, {
    "pos": "2:7:7",
    "type": "op",
    "val": ":",
}, {
    "pos": "3:0:2",
    "type": "identifier",
    "val": "bar",
}, {
    "pos": "3:3:3",
    "type": "op",
    "val": ":",
}, {
    "pos": "3:4:7",
    "type": "rvalue",
    "val": "foo",
}, {
    "pos": "4:0:2",
    "type": "recipe",
    "val": "id",
}])
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

// FIXME
suite('Expander', function() {
    test('vars', function() {
	let tokens = new make.FirstTokenizer(`
bar = bbb
foo = 1 $(bar) $(z $(zz)) $(empty) 2
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
//	console.log(parser.vars)
	let expander = new make.Expander(parser)
	expander.expand()
//	console.log(expander.vars)
    })

    test('highly recursive', function() {
	let tokens = new make.FirstTokenizer(`
foo = $($($(x)) z  x c) d
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
//	console.log(util.inspect(parser.vars, {depth: null}))
	let expander = new make.Expander(parser)
	expander.expand()
//	console.log(expander.vars)
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
