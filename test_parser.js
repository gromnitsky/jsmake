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
	    "-:4:0:3\tid\tfoo",
            "-:4:4:4\top\t=",
            "-:4:5:20\trvalue\tbar   baz = a=b",
            "-:5:0:0\tid\tc",
            "-:5:1:1\top\t=",
            "-:5:2:2\trvalue\td"
	])
    })

    test('vars', function() {
	let t = new make.FirstTokenizer(`
# a comment
foo = bar
foo =
`).tokenize().map( val => val.inspect())
	assert.deepEqual(t, [
	    "-:2:0:10\tcomment\t# a comment",
            "-:3:0:3\tid\tfoo",
            "-:3:4:4\top\t=",
            "-:3:5:8\trvalue\tbar",
            "-:4:0:3\tid\tfoo",
            "-:4:4:4\top\t=",
	])
    })

    test('rules', function() {
	let t = new make.FirstTokenizer(`
$(f	oo):
bar: foo
	id
`).tokenize().map( val => val.inspect())
	assert.deepEqual(t, [
	    "-:2:0:6\tid\t$(f\too)",
            "-:2:7:7\top\t:",
            "-:3:0:2\tid\tbar",
            "-:3:3:3\top\t:",
            "-:3:4:7\trvalue\tfoo",
            "-:4:0:2\trecipe\tid",
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
`, 'test').tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	assert.deepEqual(parser.vars, {
	    "baz": {
		value: "1",
		name: "baz",
		location: {
		    "src": "test",
		    "line": 4,
		}
            },
            "foo": {
		location: {
		    "line": 3,
		    "src": "test",
		},
		name: 'foo',
		value: "",
            }
 	})
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
`, "test").tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	assert.deepEqual(parser.vars, {})
	assert.deepEqual(parser.rules, [{
	    target: 'a',
	    "deps": "",
            "location": {
		"line": 2,
		"src": "test",
            },
            "recipes": []
	}, {
	    location: {
		line: 3,
		src: 'test',
	    },
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
	assert.deepEqual(parser.vars, {
	    "q": {
		name: 'q',
		location: {
		    "line": 1,
		    "src": "-",
		},
		 "value": "q  /a/",
	     }
	})
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
	Object.keys(parser.vars).forEach( v => {
	    parser.vars[v] = parser.vars[v].value
	})
	assert.deepEqual(parser.vars, {
            "bar": "-/bar/www",
            "dirs": "/foo/ /home/ -/bar/www   /etc/",
            "name": "Bob -/bar/www",
            "q": "name",
      	})
	assert.deepEqual(parser.rules, [
	    { target: 'qqqq', recipes: [ '@echo $(dirs)' ], location: {line:5,src:'-'}, deps: '' },
	    { target: 'name', recipes: [ '@echo $(name)' ], location: {line:11,src:'-'}, deps: ''  } ])
    })

    test('recursion 1', function() {
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
	Object.keys(parser.vars).forEach( v => {
	    parser.vars[v] = parser.vars[v].value
	})
	assert.deepEqual(parser.vars, {
            "e": "E",
            "f": "1QWE E",
            "qWE": "QWE",
            "wE": "WE",
     	})
	parser.rules.forEach( v => delete v.location)
	assert.deepEqual(parser.rules, [
	    { target: 'z', recipes: [ "@echo '-$(f)-'" ], deps: '' }
	])
    })

    test('recursion 2', function() {
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
	Object.keys(parser.vars).forEach( v => {
	    parser.vars[v] = parser.vars[v].value
	})
	assert.deepEqual(parser.vars, {
            "b": "/foo/bar",
            "c": "/foo/",
            "d": "/home/foo/",
            "e": "/home/foo//",
            "f": "/home/foo/bar/john/foo/bar/bob//foo/bar/foo/bar/foo/bar/1111//foo/",
            "z": "/foo/bar",
     	})
    })

    test('recursion 3', function() {
	let tokens = new make.FirstTokenizer(`
fo      o:
aa = $(bb) $(cc) $(zz)
bb = $(cc)
zz =

$(notdir /foo/bar): fo  o $(aa)
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	let expander = new make.Expander(parser, make.Functions)
	expander.log = () => {}
	expander.expand()
	Object.keys(parser.vars).forEach( v => {
	    parser.vars[v] = parser.vars[v].value
	})
	assert.deepEqual(parser.vars, {
	    "aa": "? ? ",
            "bb": "?",
            "zz": ""
     	})
	parser.rules.forEach( v => delete v.location)
	assert.deepEqual(parser.rules, [
	    { target: 'fo      o', deps: '', recipes: [] },
	    { target: '?', deps: 'fo  o ? ? ', recipes: [] }
     	])
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
