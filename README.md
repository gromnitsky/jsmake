# jsmake

A light version of GNU Make written in JavaScript. An MVP of a build
tool.

May serve as an example of a DAG depth-first search & macro expanding
IRL. Requires nodejs 6.x.

~~~
$ cat chain.mk
convert = @echo convert $< to $@; touch $@

files = 1.4 1.3 1.2

%.4: %.3
	$(convert)
%.3: %.2
	$(convert)
%.2: %.1
	$(convert)

clean:
	rm -f $(files)

p-%:
	@echo $($*) | tr ' ' \\n

$ touch 1.1
$ jsmake -f chain.mk 1.4
convert 1.1 to 1.2
convert 1.2 to 1.3
convert 1.3 to 1.4

$ jsmake -f chain.mk 1.4
jsmake: target '1.4' is up to date

$ jsmake -f chain.mk p-files
1.4
1.3
1.2
~~~

Pass `-d -d` (or even `-d -d -d`) for a great amount of introspection.

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
