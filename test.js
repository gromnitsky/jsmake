#!/opt/bin/mocha --ui=tdd

'use strict';

let assert = require('assert')
let util = require('util')
let cp = require('child_process')

let make = require('./jsmake')

let sh = cp.execSync

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

let tokenize_and_parse = function(str) {
    let tokens = new make.FirstTokenizer(str, 'test').tokenize()
    let parser = new make.Parser(tokens)
    parser.parse()
    return parser
}

suite('Parser', function() {
    test('empty', function() {
	let parser = new make.Parser([])
	parser.parse()
	assert.deepEqual(Object.keys(parser.vars), ['SHELL'])
	assert.deepEqual(parser.rules, [])
    })

    test('vars', function() {
	let parser = tokenize_and_parse(`
foo = bar
foo =
baz=1
`)
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
	assert.throws( () => {
	    tokenize_and_parse("\n=bar\n")
	}, /unexpected op: =/)
    })

    test('rules', function() {
	let parser = tokenize_and_parse(`
a:
b: c
	1
	2
`)
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
	assert.throws( () => {
	    tokenize_and_parse("\n:\n")
	}, /unexpected op: :/)
    })

    test('rules invalid: a misplaced recipe', function() {
	assert.throws( () => {
	    tokenize_and_parse("\nfoo=\n\thello\n")
	}, /unexpected recipe/)
    })

})

let NO_LOC = 1
let NAME_VAL = 2

let tokenize_parse_expand = function(str, flags) {
    let parser = tokenize_and_parse(str)
    let exp = new make.Expander(parser, make.Functions)
    exp.expand()
    if (flags & NO_LOC) parser.rules.forEach( v => delete v.location)
    if (flags & NAME_VAL) Object.keys(parser.vars).forEach( v => {
	parser.vars[v] = parser.vars[v].value
    })
    return exp
}

suite('Expander', function() {
    test('cycle 1', function() {
	assert.throws( () => {
	    tokenize_parse_expand(`
q = $(w)
w = $(q)
$(q):
`)
	}, /var 'q' references itself/)
    })

    test('cycle 2', function() {
	assert.throws( () => {
	    tokenize_parse_expand(`
q = $(q)
$(q):
`)
	}, /var 'q' references itself/)
    })

    test('cycle 3', function() {
	assert.throws( () => {
	    tokenize_parse_expand(`
a = $(b)
b = $(c)
c = cda

loop = $(bad)
bad = $(loop)

test: $(a) $(loop)
`)
	}, /var 'loop' references itself/)
    })

    test('cycle 4', function() {
	assert.doesNotThrow( () => {
	    tokenize_parse_expand(`
a = $(b)
b = $(c)
c = cda
test: $(a) $(a) $(dir $(a))
`)
	}, /var 'a' references itself/)
    })

    test('cycle 5', function() {
	assert.doesNotThrow( () => {
	    tokenize_parse_expand("\ntest: $(dir $(dir /a/b/c/d))\n")
	}, /references itself/)
    })

    test('dir', function() {
	let exp = tokenize_parse_expand(`
q = q  $(dir /a/b)
$(q):
`)
	assert.deepEqual(exp.parser.vars.q.value, "q  $(dir /a/b)")
	assert.deepEqual(exp.parser.rules, [{
            "deps": "",
            "location": {
		"line": 3,
		"src": "test",
            },
            "recipes": [],
            "target": "q  /a/",
        }])
    })

    test('escape $', function() {
	let exp = tokenize_parse_expand(`
a = $$$(foo$$$(bar))$$(bar)
foo$$123 = FOO
bar = 123
test: $(a)
`)
	assert.equal(exp.parser.rules[0].deps, '$FOO$(bar)')
    })

    test('refs', function() {
	let exp = tokenize_parse_expand(`
dirs = $(dir  /foo/bar    /home/bob) $(bar)   $(dir /etc/news)
bar = $(subst /qqq,/bar,-/qqq/www)

qqqq:
	@echo $(dirs)

q = name
$(q) = Bob $(bar)

$(q): $(dirs)
	@echo $(name)
`, NO_LOC|NAME_VAL)
	assert.deepEqual(exp.parser.vars, {
	    "SHELL": "/bin/sh",
            "bar": "$(subst /qqq,/bar,-/qqq/www)",
            "dirs": "$(dir  /foo/bar    /home/bob) $(bar)   $(dir /etc/news)",
            "name": "Bob $(bar)",
            "q": "name",
      	})
	assert.deepEqual(exp.parser.rules, [
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
	let exp = tokenize_parse_expand(`
f=1$(q$(w$(e))) $(e)
$(f):
	@echo '-$(f)-'
# env var
e=$(PAGER)
wless=WE
qWE=QWE
`)
	assert.deepEqual(exp.parser.rules[0].target, '1QWE less')
    })

    test('recursion 2', function() {
	let exp = tokenize_parse_expand(`
b=$(z)
c=$(dir $(b))
d=$(dir /home$(b))
e=$(dir /home$(dir $(b))/john)
f=$(dir /home$(b)/john$(b)/bob/$(b)$(b)$(b)/1111/$(b))

z=/foo/bar
$(f): $(e)
foo: $(f)
`, NO_LOC)
	assert.deepEqual(exp.parser.rules, [{
		"deps": "/home/foo//",
		"recipes": [],
		"target": "/home/foo/bar/john/foo/bar/bob//foo/bar/foo/bar/foo/bar/1111//foo/",
            }, {
		"deps": "/home/foo/bar/john/foo/bar/bob//foo/bar/foo/bar/foo/bar/1111//foo/",
		"recipes": [],
		"target": "foo",
            }])
    })

    test('recursion 3', function() {
	let exp = tokenize_parse_expand(`
fo      o:
aa = $(bb) $(cc) $(zz)
bb = $(cc)
zz =

$(notdir /foo/bar): fo  o $(aa)
`, NO_LOC)
	assert.deepEqual(exp.parser.rules, [
	    { target: 'fo      o', deps: '', recipes: [] },
	    { target: '?', deps: 'fo  o ? ? ', recipes: [] }
     	])
    })

    test('single char var', function() {
	let exp = tokenize_parse_expand(`
a = /foo
q: $(a) '$a$a' 1 $a 2 $(a) 3 $a
`, NO_LOC)
	assert.deepEqual(exp.parser.rules[0].deps,
			 "/foo '/foo/foo' 1 /foo 2 /foo 3 /foo")
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

class Eater extends make.Logger {
    constructor(v, p) {
	super(v, p)
	this.logs = []
	this.func = (...args) => {
	    this.logs.push(args)
	}
    }
}

let capture_stdout = function(cb) {
    let write = process.stdout.write
    let stdout = []
    process.stdout.write = str => stdout.push(str.toString())
    try {
	cb()
    } catch (e) {
	throw e
    } finally {
	process.stdout.write = write
    }
    return stdout
}

let tokenize_parse_expand_recompile = function(str, goals = [], verbosity = 0) {
    let exp = tokenize_parse_expand(str)
    let maker = new make.Maker(exp.parser, goals)
    maker.logger = new Eater(verbosity, 'test')
    maker.normalize()
    let stdout = capture_stdout( () => maker.recompile())
    maker.logger.logs = maker.logger.logs.filter( v => v.length)
    return {stdout, maker}
}

suite('Maker', function() {
    setup(function() {
	this.save_dir = process.cwd()
	sh('mkdir -p tmp')
	process.chdir('tmp')
	this.eater = new Eater(1, 'test')
    })

    teardown(function() {
	process.chdir(this.save_dir)
	sh('rm -rf tmp')
	this.eater.logs = []
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

    test('stem-empty-suffix', function() {
	let stem = make.Maker.stem
	assert.equal(stem('pp-%', 'pp-files'), 'files')
	assert.equal(stem('p/p-%', 'p/p-files'), 'files')
    })

    test('escape $', function() {
	let r = tokenize_parse_expand_recompile(`
test:
	@echo '$$(SHELL)=$(SHELL)'
`)
	assert.deepEqual(r.stdout, [ "$(SHELL)=/bin/sh\n" ])
    })

    test('chain of implicits', function() {
	sh('touch 1.1')
	let r = tokenize_parse_expand_recompile(`
convert = @echo convert $< to $@; touch $@

files = 1.4 1.3 1.2

%.4: %.3
	$(convert)
%.3: %.2
	$(convert)
%.2: %.1
	$(convert)

pp-%:
	@echo $($*) | tr ' ' \\n
`, ['1.4', '1.3'], 1)
	assert.deepEqual(r.stdout, [ 'convert 1.1 to 1.2\n',
				     'convert 1.2 to 1.3\n',
				     'convert 1.3 to 1.4\n' ])
	assert.deepEqual(r.maker.logger.logs,
			 [ [ '\'1.4\' deps:', [ '1.1', '1.2', '1.3' ] ],
			   [ 'nothing to be done for \'1.1\'' ],
			   [ '\'1.3\' deps:', [ '1.1', '1.2' ] ],
			   [ 'nothing to be done for \'1.1\'' ],
			   [ 'target \'1.2\' is up to date' ],
			   [ 'target \'1.3\' is up to date' ] ])
    })

    test('cancel implicit rule', function() {
	sh('touch 1.1')
	assert.throws( () => {
	    tokenize_parse_expand_recompile(`
%.2: %.1
	@echo making $@ from $<
%.2: %.1
foo: 1.2
`)
	}, /no rule to make target '1.2'/)
    })

    test('glob', function() {
	sh('touch 1.foo 2.foo 1.bar 2.bar')
	let r = tokenize_parse_expand_recompile('*.foo: *.bar')
	assert.deepEqual(r.maker.parser.rules[0].deps, '*.bar')
	assert.equal(r.maker.default_goal(), '1.foo')
	assert.deepEqual(r.maker.rules.normal['1.foo'].deps,
			 ['1.bar', '2.bar'])
    })

    test('override', function() {
	let r = tokenize_parse_expand_recompile(`
foo: bar
	@echo must not run
foo: baz
	@echo making $@ from $<
bar:
	@echo always making $@
baz:
`, [], 1)
	assert.equal(r.maker.default_goal(), 'foo')
	assert.deepEqual(Object.keys(r.maker.rules.normal),
			 ['foo', 'bar', 'baz'])
	assert.deepEqual(r.stdout,  ['always making bar\n',
				     'making foo from bar\n'])
	assert.deepEqual(r.maker.logger.logs,
			 [ [ 'test:4:',
			     'overriding recipe for target \'foo\', test:2' ],
			   [ '\'foo\' deps:', [ 'baz', 'bar' ] ],
			   [ 'nothing to be done for \'baz\'' ] ])
    })

    test('empty', function() {
	assert.throws( () => {
	    tokenize_parse_expand_recompile('', ['foo'])
	}, /no rule to make target 'foo'/)
    })

    test('implicit rule selection', function() {
	let str = `
convert = @echo "make $@ from $< (stem=$(*))"

%.o: %.c
	$(convert)

%.o: %.f
	$(convert)

%.f:
	@echo always create $@

lib/%.o: lib/%.c
	$(convert)
`
	// 1st rule
	sh('touch bar.c bar.f')
	let r = tokenize_parse_expand_recompile(str, ['bar.o'])
	assert.deepEqual(r.stdout, ['make bar.o from bar.c (stem=bar)\n'])

	// 2nd rule
	sh('rm bar.c')
	r = tokenize_parse_expand_recompile(str, ['bar.o'])
	assert.deepEqual(r.stdout, ['make bar.o from bar.f (stem=bar)\n'])

	// 1st rule
	sh('rm bar.f')
	r = tokenize_parse_expand_recompile(str, ['bar.o'])
	assert.deepEqual(r.stdout, ['always create bar.f\n',
				    'make bar.o from bar.f (stem=bar)\n'])

	// 3rd rule
	sh('mkdir lib && touch lib/bar.c lib/bar.f')
	r = tokenize_parse_expand_recompile(str, ['lib/bar.o'])
	assert.deepEqual(r.stdout, ["make lib/bar.o from lib/bar.c (stem=bar)\n"])

	// 2nd rule
	sh('rm lib/bar.c')
	r = tokenize_parse_expand_recompile(str, ['lib/bar.o'])
	assert.deepEqual(r.stdout, ["make lib/bar.o from lib/bar.f (stem=lib/bar)\n"])
    })

})
