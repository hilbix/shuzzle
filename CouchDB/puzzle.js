#!/usr/bin/env js
//
// Find list of possible matches in CouchDB
//
// ./shuzzle gen "$img" | ./shuzzle sig 50 12 | CouchDB/puzzle.js |
// sort -n | tail -100 |
// sed 's!^[^ ]* !/path/to/image/vault/!' | ./shuzzle.cmp "$img" -
// # do not forget the trailing '-' above -----------------------^
//
// This does:
// - Calculate the signatures of the given $img
// - extract 100 matches (leave tail away to check all matches)
// - and then compare all the images
// - output "Float FILENAME" for each compared image
//
// The Float is the distance from puzzle_vector_normalized_distance()
// (see: man libpuzzle)

const fetch = require('node-fetch');
const Semaphore = require('./Semaphore');

const OOPS = function (...s) { console.log('OOPS', ...s); process.exit(23) }
const ASSERT = (bool, ...s) => { if (!bool) OOPS('assertion failed', ...s) }

const BASE      = 'http://127.0.0.1:5984/puzzle/';
const U		= d => encodeURIComponent(d);
const J		= d => JSON.stringify(d);
const GETJ	= (url) 	=> fetch(url, {cache:'no-cache', method:'GET',                headers:{'Content-Type':'application/json'}}).then(_ => _.json()).catch(OOPS);
const PUTJ	= (url,data)	=> fetch(url, {cache:'no-cache', method:'PUT',  body:J(data), headers:{'Content-Type':'application/json'}}).then(_ => _.json()).catch(OOPS);
const POSTJ	= (url,data)	=> fetch(url, {cache:'no-cache', method:'POST', body:J(data), headers:{'Content-Type':'application/json'}}).then(_ => _.json()).catch(OOPS);

main();

async function* lines(fd, encoding='utf-8')
{
  let buf = '';

  process.stdin.setEncoding(encoding);
//  process.stdin.resume();
//  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  for await (const data of process.stdin)
    {
      buf	+= data;
      const tmp = buf.split('\n');
      buf	= tmp.pop();
      for (const line of tmp)
        yield line;
    }
  if (buf.length)
    {
      yield buf;
      console.log('OOPS, incomplete last line', buf);
    }
}

// Semaphore(10, ..) limits to 10 parallel running functions.
// Alternatively we could use
// const GET10 = Semaphore(10,GETJ);
// and use GET10 below instead of GETJ.
const get = Semaphore(10, async function(n,k,rec)
  {
    const key	= k.startsWith('_') ? '\t'+k.substring(1) : k;  // escaped _ reserved by CouchDB
    const col	= String.fromCharCode(n);
    const url	= `${BASE}${U(key)}`;
    const doc	= await GETJ(url);
    if (doc._id !== key)
      {
        rec.miss++;
        ASSERT(doc.error === 'not_found', 'fail', n, J(key), doc)
        return;
      }
    if (!doc[col])
      {
        rec.miss++;
        return;
      }
    rec.hit++;
    for (const s of doc[col])
      rec.ids[s] = (rec.ids[s]||0)+1;
//    console.log(rec);
  });

async function main()
{
  const run	= [];
  const	rec	= {hit:0,miss:0,ids:{}};
  const id	= process.argv[2];
  let n	= 32;
  for await (const l of lines(process.stdin))
    {
      if (l.startsWith('P')) continue;

      const s = l.split('\t');
      ASSERT(s.length === 3);
      ASSERT(s[0]==='S');
//      const name = s[2].split('/').pop().split('.',2).join('.');
//      ASSERT(name.length>0);
//      ASSERT(name === id);

      if (++n==95) n++;	// skip _ (reserved by CouchDB)
      run.push(get(n, s[1], rec));
    }
  await Promise.all(run);

  if (rec.ids[id] !== rec.hit || rec.miss)
    {
      // image is not in database
      // but this makes no difference
    }
  delete rec.ids[id];

  for (const s in rec.ids)
    console.log(rec.ids[s], s);
}

