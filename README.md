# jsmake

A light version of GNU Make written in JavaScript. An MVP of a build
tool.

May serve as an example of a DAG depth-first search & macro expanding
IRL. Requires nodejs 6.x.

~~~
$ jsmake -h
Usage: jsmake [-f file|-] [-tn] [-d] [-vh] [--graphviz] [name=val ...]

$ cat chain.mk
convert = @echo create $< from $@; touch $@

files = 1.7 1.6 1.5 1.4 1.3 1.2 1.1

clean:
	rm -f $(files)

%.7: %.6
	$(convert)
%.6: %.5
	$(convert)
%.5: %.4
	$(convert)
%.4: %.3
	$(convert)
%.3: %.2
	$(convert)
%.2: %.1
	$(convert)

1.1:
	touch $@

p-%:
	@echo $($*) | tr ' ' \\n

$ jsmake -f chain.mk 1.7
touch 1.1
create 1.1 from 1.2
create 1.2 from 1.3
create 1.3 from 1.4
create 1.4 from 1.5
create 1.5 from 1.6
create 1.6 from 1.7

$ jsmake -f chain.mk 1.7
jsmake: target '1.7' is up to date

$ touch 1.5 && jsmake -f chain.mk 1.7
create 1.5 from 1.6
create 1.6 from 1.7

$ jsmake -f chain.mk p-files
1.7
1.6
1.5
1.4
1.3
1.2
~~~

Pass `-d -d` (or even `-d -d -d`) for a great amount of introspection.

## Drawing dependency graphs

Using the same `chain.mk` above:

	$ jsmake -f chain.mk 1.7 --graphviz | dot -Tpng -Grankdir=LR -Nwidth=0 -Nheight=0 | xv -
![](http://ultraimg.com/images/2017/07/15/GPTz.png)

The box-shaped vertices denote the targets generated from the implicit
rules.

## What it's not

As it's the "light" variant (for example, by default, it has only 1
build-in variable: `SHELL`), some features of GNU Make will never land
in it, viz.:

* double-colon rules
* pattern rules w/ double colons
* static pattern rules (don't mix them up w/ *implicit rules* that are
  supported)
* phony targets
* .ONESHELL
* simply expanded vars ':='
* `$(file)`, `$(origin)`, `$(flavor)`, `$(guile)`
* a catalogue of build-in rules
* pattern rules w/ multiple targets
* order-only prereqs
* `$%`, `$?`, `$+`, `$|`
* 'old-fashioned' suffix rules
* archive members as targets
* `$(wildcard)`
* VPATH & vpath
* a parallel execution

Features that are missing temporarily:

* all built-in functions such as `$(notdir)`, `$(shell)`, &c (they're
  very easy to add)

Features that are missing but should be added:

* `include` directive
* +=
* `$(foreach)`, `$(call)`, `$(eval)`
* escape '%' in implicit rules & `$(patsubst)`

Features that are missing that *may* be added:

* .SECONDEXPANSION
* target-speficic vars
* -e CLO
* conditionals
* inline conditionals as `$(or)`
* multi-line vars

## License

MIT.
