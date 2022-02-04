# shuzzle

Shell tool to libpuzzle.  On top you can implement a database based image compare from shell level easily.

See also:

- https://stackoverflow.com/questions/9703762/libpuzzle-indexing-millions-of-pictures
- `man libpuzzle`


## Usage

	git clone https://github.com/hilbix/shuzzle.git
	make -C shuzzle
	make install -C shuzzle

Then:

	find imgs -type f -print0 | ./shuzzle gen 0 | ./shuzzle sig N M | insert-into-db.sh
	./shuzzle gen "img" | ./shuzzle sig N M | find-similar-in-db.sh | ./shuzzle cmp 0.6 | sort -rz

- `N` is the number of signatures of length `M`
  - Both are optional
  - See `./shuzzle` for defaults of `N` and `M`
- `gen 0` to read filenames from STDIN separated with NUL
  - Each filename MUST be NUL terminated (including the last one).
  - Outputs `V`ector lines
- `sig N M` outputs N signatures of length M for each `V`-line
  - Outputs multiple `S`ignature lines per `V`-line
  - Order of the `S` lines matters! (Nth line of file1 relates to Nth line of file2)
- `cmp [file..]`
  - reads the given files and compares them
  - first file is the one compared to all the other ones
  - Again you can give `0` or `-` to read stdin

How to find similar pictures?

- Store all compare values into an `N:M` database relation `filename`:`N+signature`
  - `find imgs -type f -print0 | ./shuzzle gen 0 | ./shuzzle sig N M | insert-into-db.sh`
  - Be sure that the multi-lines are correctly sorted (see `n` variable in next step)
- Find names of images of several same signatures in the database and feed that to `cmp`:
  - `n=0; ./shuzzle gen "$img" | ./shuzzle sig N M | while IFS=$'\t' read -r tag sig name; do let n++; find-in-db.sh "$n+$sig"; done | sort -zu | ./shuzzle cmp "$img"`

### Not yet implemented:

ZeroMQ adapter (plan might change):

- `shuzzle zmq LISTEN N M`
  - if this receives a single filename it returns the signatures
  - if this receives a list of NUL separated filenames, it returns the `threshold` of `cmp`, without filenames
- `shuzzle con CONNECT` to test this adapter from commandline
  - this has the same commandline like `cmp`


## FAQ

WTF why?

- Because I need it to do some tests with CouchDB

Shuzzle?

- `shuzzle` is pronounced like the German word "Schussel" which means a clumsy person

License?

- Are you kidding?  The creative work is in `man libpuzzle`, not in this here.

