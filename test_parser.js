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
	assert.deepEqual(Object.keys(parser.vars), ['SHELL'])
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
	     "SHELL": {
		 "location": {
		     "line": -1,
		     "src": "def",
		 },
		 "name": "SHELL",
		 "value": "/bin/sh",
	     },
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
    test('cycle 1', function() {
	let tokens = new make.FirstTokenizer(`
q = $(w)
w = $(q)
$(q):
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	assert.throws( () => {
	    new make.Expander(parser).expand()
	}, /var 'q' references itself/)
    })

    test('cycle 2', function() {
	let tokens = new make.FirstTokenizer(`
q = $(q)
$(q):
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	assert.throws( () => {
	    new make.Expander(parser).expand()
	}, /var 'q' references itself/)
    })

    test('cycle 3', function() {
	let tokens = new make.FirstTokenizer(`
a = $(b)
b = $(c)
c = cda

loop = $(bad)
bad = $(loop)

test: $(a) $(loop)
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	assert.throws( () => {
	    new make.Expander(parser).expand()
	}, /var 'loop' references itself/)
    })

    test('cycle 4', function() {
	let tokens = new make.FirstTokenizer(`
a = $(b)
b = $(c)
c = cda
test: $(a) $(a) $(dir $(a))
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	assert.doesNotThrow( () => {
	    new make.Expander(parser, make.Functions).expand()

	}, /var 'a' references itself/)
    })

    test('cycle 5', function() {
	let tokens = new make.FirstTokenizer(`
test: $(dir $(dir /a/b/c/d))
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	assert.doesNotThrow( () => {
	    new make.Expander(parser, make.Functions).expand()

	}, /references itself/)
    })

    test('dir', function() {
	let tokens = new make.FirstTokenizer(`
q = q  $(dir /a/b)
$(q):
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	new make.Expander(parser, make.Functions).expand()
	assert.deepEqual(parser.vars.q.value, "q  $(dir /a/b)")
	assert.deepEqual(parser.rules, [{
            "deps": "",
            "location": {
		"line": 3,
		"src": "-",
            },
            "recipes": [],
            "target": "q  /a/",
        }])
    })

    test('refs', function() {
	let tokens = new make.FirstTokenizer(`
dirs = $(dir  /foo/bar    /home/bob) $(bar)   $(dir /etc/news)
bar = $(subst /qqq,/bar,-/qqq/www)

qqqq:
	@echo $(dirs)

q = name
$(q) = Bob $(bar)

$(q): $(dirs)
	@echo $(name)
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	new make.Expander(parser, make.Functions).expand()
	Object.keys(parser.vars).forEach( v => {
	    parser.vars[v] = parser.vars[v].value
	})
	assert.deepEqual(parser.vars, {
	    "SHELL": "/bin/sh",
            "bar": "$(subst /qqq,/bar,-/qqq/www)",
            "dirs": "$(dir  /foo/bar    /home/bob) $(bar)   $(dir /etc/news)",
            "name": "Bob $(bar)",
            "q": "name",
      	})
	parser.rules.forEach( v => delete v.location)
	assert.deepEqual(parser.rules, [
	    {
		"deps": "",
		"recipes": [ "@echo $(dirs)" ],
		"target": "qqqq",
            },
            {
		"deps": "/foo/ /home/ -/bar/www   /etc/",
		"recipes": [ "@echo $(name)" ],
		"target": "name",
            }
	])
    })

    test('recursion 1', function() {
	let tokens = new make.FirstTokenizer(`
f=1$(q$(w$(e))) $(e)
$(f):
	@echo '-$(f)-'
# env var
e=$(PAGER)
wless=WE
qWE=QWE
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	new make.Expander(parser, make.Functions).expand()
	assert.deepEqual(parser.rules[0].target, '1QWE less')
    })

    test('recursion 2', function() {
	let tokens = new make.FirstTokenizer(`
b=$(z)
c=$(dir $(b))
d=$(dir /home$(b))
e=$(dir /home$(dir $(b))/john)
f=$(dir /home$(b)/john$(b)/bob/$(b)$(b)$(b)/1111/$(b))

z=/foo/bar
$(f): $(e)
foo: $(f)
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	new make.Expander(parser, make.Functions).expand()
	parser.rules.forEach( v => delete v.location)
	assert.deepEqual(parser.rules, [
            {
		"deps": "/home/foo//",
		"recipes": [],
		"target": "/home/foo/bar/john/foo/bar/bob//foo/bar/foo/bar/foo/bar/1111//foo/",
            },
            {
		"deps": "/home/foo/bar/john/foo/bar/bob//foo/bar/foo/bar/foo/bar/1111//foo/",
		"recipes": [],
		"target": "foo",
            }
	])
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
	parser.rules.forEach( v => delete v.location)
	assert.deepEqual(parser.rules, [
	    { target: 'fo      o', deps: '', recipes: [] },
	    { target: '?', deps: 'fo  o ? ? ', recipes: [] }
     	])
    })

    test('single char var', function() {
	let tokens = new make.FirstTokenizer(`
a = /foo
q: $(a) $a$a 1 $a 2 $(a) 3 $a
`).tokenize()
	let parser = new make.Parser(tokens)
	parser.parse()
	let expander = new make.Expander(parser, make.Functions)
	expander.log = () => {}
	expander.expand()
	parser.rules.forEach( v => delete v.location)
	assert.deepEqual(parser.rules[0].deps,
			 "/foo /foo/foo 1 /foo 2 /foo 3 /foo")
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

suite('Maker', function() {
    setup(function() {
    })

    test('stem', function() {
	let stem = make.Maker.stem
	assert.equal(stem('e%t', 'src/eat'), 'src/a')
	assert.equal(stem('c%r', 'src/car'), 'src/a')

	assert.equal(stem('e%t', 'eat'), 'a')

	assert.equal(stem('invalid', 'src/car'), undefined)

	assert.equal(stem('lib/%.o', 'lib/foo.o'), 'foo')
	assert.equal(stem('lib/%.c', 'lib/foo.c'), 'foo')
    })
})
