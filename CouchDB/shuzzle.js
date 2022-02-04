#!/usr/bin/env js
// This Works is placed under the terms of the Copyright Less License,
// see file COPYRIGHT.CLL.  USE AT OWN RISK, ABSOLUTELY NO WARRANTY.
//
// Store Signatures into CouchDB (URL see BASE).
// Uses 1 record per signature, holding a JSON with a 1 character key of the number of the signature.
// There is no need for views, so data is kept likewise efficient.
//
// Fill with something like:
// LIST=("$@")	# keep list of all filenames
// ./shuzzle gen "${LIST[@]}" | ./shuzzle sig 50 12 | CouchDB/shuzzle.js
//
// !! SEE FILENAME MANGLING BELOW !!

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

const put = Semaphore(10, async function(proto)
  {
    let n = 32;
    let cnt = 0, upd=false;
    const id = proto.id;
    for (const k of proto.s)
      {
        const key	= k.startsWith('_') ? '\t'+k.substring(1) : k;	// escaped _ reserved by CouchDB

        if (++n==95) n++;	// skip _ (reserved by CouchDB)
        const	col = String.fromCharCode(n);

        const	url = `${BASE}${U(key)}`;
        let	what;

        for (let retry=0;; retry++)
          {
            if (retry>20)
              OOPS('retries exceeded', id);
            let	doc	= await GETJ(url);
            what	= () => cnt++;
            if (doc._id !== key)
              {
                ASSERT(doc.error === 'not_found', 'fail', id, n, doc)
                doc	= { _id:key, [col]:[id] };
              }
            else
              {
                const c = doc[col];
                if (!c)
                  doc[col] = [id];
                else if (c.includes(id))
                  {
                    what	= () => {};
                    break;
                  }
                else
                  {
                    what= () => upd=true;
                    c.push(id);
                    c.sort();
                  }
              }
            const ok = await PUTJ(url, doc);
            if (ok.ok)
              break;
            ASSERT(ok.error === 'conflict', 'failed', ok, doc);
            process.stdout.write('!');
            await new Promise(ok => setTimeout(ok, 100*retry));
          }
        what();
      }
    process.stdout.write(upd || cnt ? String.fromCharCode(48+cnt) : '.');
  });

async function main()
{
  let rec = {}, cnt=0;
  for await (const l of lines(process.stdin))
    {
      if (l.startsWith('P')) continue;
      const s = l.split('\t');
      ASSERT(s.length === 3);
      ASSERT(s[0]==='S');
      // FILENAME MANGLING
      // At my side images look like some/path/HASH.COLLISION.extension
      // where HASH is the content-hash of the image
      // and COLLISION is just a number in case different files hash to the same HASH
      // Following extracts HASH.COLLISION only from the paths:
      const name = s[2].split('/').pop().split('.',2).join('.');
      ASSERT(name.length>0);
      if (rec.id !== name)
        {
          if (rec.s)
            {
              ASSERT(rec.s.length === 50, rec.s.length);
              cnt++;
              put(rec);
            }
          rec	= {id:name, s:[]};
        }
      rec.s.push(s[1]);
    }
  if (rec.s)
    {
      cnt++;
      put(rec);
    }

  process.stdout.write(` ${cnt} `);
  await put.Wait();
  process.stdout.write(`\n`);
}

