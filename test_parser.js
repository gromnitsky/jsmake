#!/opt/bin/mocha --ui=tdd

'use strict';

let assert = require('assert')
let make = require('./jsmake')

suite('FirstTokenizer', function() {
    test('empty', function() {
	assert.deepEqual(new make.FirstTokenizer('').tokenize(), [])
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
    "val": "foo "
}, {
    "pos": "3:4:4",
    "type": "op",
    "val": "="
}, {
    "pos": "3:5:8",
    "type": "lvalue",
    "val": " bar"
}, {
    "pos": "4:0:3",
    "type": "identifier",
    "val": "foo ",
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
    "type": "lvalue",
    "val": " foo",
}, {
    "pos": "4:0:2",
    "type": "recipe",
    "val": "\tid",
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
	assert.deepEqual(parser.vars, {'foo ': '', baz: 1})
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
	    deps: ' c',
	    recipes: [ "\t1", "\t2" ]
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
