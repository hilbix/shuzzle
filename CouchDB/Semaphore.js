'use strict';
/*S*/ const CONSOLE = this.CONSOLE || ((...a) => { console.log(...a) });		// shall return void 0
/*S*/ const _FPC = Function.prototype.call;
/*S*/ const DONOTHING = function(){}							// The "do nothing" DUMMY function
/*S*/ const C = (fn,...a) => function (...b) { return _FPC.call(fn,this,...a,...b) }	// Curry (allows to bind this)
/*S*/ const D = (...a) => this.DEBUGGING ? CONSOLE('DEBUG', ...a) : void 0;
/*S*/ const DD = (...a) => this.DEBUGGING ? C(D,...a) : DONOTHING			// log = DD('err in xxx'); log('whatever')
/*S*/ const THROW = e => { e = e instanceof Error ? e : e instanceof ErrorEvent ? new Error(e.message, e.filename, e.lineno, e.colno) : new Error(e); D('ERROR', e); throw e }
/*S*/ const isFunction = f => typeof f === 'function';					// https://stackoverflow.com/a/6000009
/*S*/ const PE = Promise.reject(); PE.catch(DONOTHING);					// Promise.reject() but ignore when .catch() is missing
/*S*/ const PO = () => { const o={}; o.p = new Promise((ok,ko) => { o.ok=ok; o.ko=ko }); return o }	// PromiseObject
//S//
// Examples:
// for (let i=0; ++i<1000000; ) fetch(`http://example.com/?${i}`);	// crashes the Tab
// const fetch50 = Semaphore(50, fetch);				// repair
// for (let i=0; ++i<1000000; ) fetch50(`http://example.com/?${i}`);	// works
/*
  const x = Semaphore(
        _ => { console.log('running', _.run); return 10 },
        (v,ms) => new Promise(ok => setTimeout(ok, ms, {v, ms})).then(_ => console.log('resolved', _)),
        'waiting was'
        );
 for (let i=100; --i>0; x(Math.random()*10000|0));
 await x.Wait();
*/
/*
  const sem = Semaphore(1);

  async function task(s)
    {
      console.log('task', s);
      const release = await sem.Acquire(1);
      console.log(1, s);
      await SleeP(2500);
      console.log(2, s);
      release();
      return s;
    }

  task('hello').then(console.log);
  task('world').then(console.log);
  console.log('main');
*/
// Semaphore() returns with following properties:
// .max 	parameter 1  passed to Semaphore (your chosen max value or function).
// .fn		parameter 2  passed to Semaphore (the function protected by Semaphore)
// .args	parameter 3+ passed to Semaphore (the first arguments to .fn)
// .count	number of currently running calls
// .wait	number of currently waiting calls
// .cancel(..)	cancels all waiting calls (this rejects their promise!)
// .stop()	stops further execution
// .start()	starts execution again
//
// .max, .fn and .args can be changed on the fly!
// If .fn is NULL, a call to the return of Semaphore just resolves to the array of given parameters.
//
// .cancel .stop .start are chainable (return the Semaphore)
// .cancel(N,M)	cancels waiting tasks with message M.  By default this is the array of the second arguments passed to fn.
// .cancel()	cancels all
// .cancel(+N)	cancels the first N on the waiting list
// .cancel(-N)	cancels the last  N on the waiting list
// .try()	Same as Acquire(), but synchronous.  Hence it fails if no Semaphore available (or max() returns a Promise or throws)
// .Acquire()	acquires 1.  returns a Promise which resolves to the "release()" function.
// .Acquire(0)	acquires all free (at least 1).
//		release() or release(void 0) releases all Acquired, release(1) only releases 1.  Throws if "overreleased"
// .Wait()	same as .Wait(0): waits for all releases (Semaphore is idle)
// .Wait(N)	wait for N Releases. .Wait(-N) returns immediately if less than N is running, else waits for next Release.
// .Max(N)	wait until .count is not more than N, .Max() is .Max(0)
// .Min(N)	wait until .count is at least N, .Min() is .Min(0)
//		Min(0) waits until something happens on the Semaphore
//		Min(-1) waits until a Release or Acquire
//		Min(-2) waits until an Acquire
//
// If .max is a function, it is called with the Semaphore (and optional .Acquire() args) can dynamically return how much work to do in parallel.
// If it returns a Promise, execution halts until the Promise resolves.  If it rejects or .max() throws, this is as if it returns 1
// .max() is always called when something happens on the Semaphore (work added, finished, etc.), so it can be used to implement progress monitoring.
//
// JS has no support to abort async functions, hence there is no way to cancel running functions (yet).
// If someone comes up with a good idea on how to cancel async functions, it should be implemented, too.
const Semaphore = (max, fn, ...args) =>
  {
    const D = DD('Semaphore');
    let run = 0, wait = 0;
    let maxing;		// set while run.max() is awaited
    let waiting, cntwait;
    const waits = [];
    const upd = n =>
      {
        n		= n|0;
        ret.count	= run += n;
        ret.wait	= waits.length + wait;
        if (n<0 && waiting)
          {
            const ok	= waiting.ok;
            waiting	= void 0;
            ok(n);		// reenable all waiting .Acquires
          }
        if (cntwait)
          {
            const ok	= cntwait.ok;
            cntwait	= void 0;
            ok(n);
          }
      }
    const check = _ =>
      {
        D('check', _);
        maxing = void 0;
        _ = _|0;
        if ((_<=0 || run<_) && waits.length)
          {
            const x	= waits.shift();
            upd(1);
            x[0](x[2]);
          }
      }
    const get = (...a) =>
      {
        D('get', a);
        upd();
        try {
          return isFunction(ret.max) ? ret.max(ret, ...a) : ret.max;
        } catch (e) {
          return PE;
        }
      }
    const next = _ =>
      {
        D('next', _);
        if (maxing) return upd();
        const limit = get();
        if (limit && limit.then)
          maxing = Promise.resolve(limit).then(check, _=>check(1));	// in case of max() failing, we just ensure one semaphore runs so this is called again
        else
          check(limit);
        return _;
      }
    const cancel = (n,msg) =>
      {
        let _;
        if (n === void 0) n	= waits.length;
        for (n = n|0; n<0 && (_ = waits.pop())  ; _++) _[1](c || _[2]);
        for (       ; n>0 && (_ = waits.shift()); _--) _[1](c || _[2]);
        if (waiting) waiting.ko(msg);		// we cannot cancel N here, just all which wait for .Aquire()
        return ret;
      }
    const release_function = n =>
      {
        // release.left count left
        // release.release is the same function such that you can do sem.Acquire(1).then(_ => _.run(fn, ...).release());
        // release() releases all
        // release(0) does nothing (except updating properties)
        function release(k)
          {
            D('release', k);
            if (k===void 0 && !(k=n)) THROW(`release(): already fully released`);
            k = k|0;
            if (k<0) THROW(`release(${k}): negative`);
            if (n<k) THROW(`release(${k}): too high (max ${n})`);
            release.left	= n -= k;
            upd(-k);
            return release;
          }

        upd(n);

        release.release = release;
        release.run = (fn, ...args) => { CATCH$$(fn, release(0), args); return release(0) }
        return release(0);
      }
    const acquire = (N,...a) =>		// acquire('1') works.  acquire('0') throws!
      {
        D('try', N,a);
//        if (maxing) return;		// max is already resolving -> nope, perhaps max() behaves differently here
        let n = N === void 0 ? 1 : N|0;	// This works for classes with toString() returning nonnull integer
        if (!n && N!==0)		THROW(`.acquire(${N}): nonnumeric`);
        if (n<0)			THROW('.aquire(${n}): negative');

        let limit = get(N,...a);	// passing N, not n
        if (limit && limit.then)	THROW(`cannot use async .max() in non-async .acquire()`);
        limit = limit|0;

        if (!n)
          {
            if (limit<=0)		THROW(`.acquire(${n}): unlimited (.max is ${limit})`);
            n	= limit-run;
            if (n<1) return;		// Too much
          }
        else if (limit>0)
          {
            if (n>limit)		THROW(`.acquire(${n}): unsatisfyable (max is ${limit})`);
            if (run+n>limit) return;	// Too much
          }
        return release_function(n);
      }
    const step = () =>
      {
        if (!cntwait)
          cntwait	= PO();
        return cntwait.p;
      }
    const work = () =>
      {
        if (!waiting)
          waiting = PO();
        waiting.p.finally(() => wait--);	// this to work correctly needs a sane implementation of Promise()
        wait++;
        return waiting.p;
      }
    const Max = async N =>
      {
        N = N|0;
        while (run>N)
          await step();
        return ret;
      }
    const Min = async N =>
      {
        N = N|0;
        if (N<=0 || run<N)
          do
            {
              const n = await step();
              if (N<0 && !n || N<-1 && n<0)
                continue;
            } while (run<N);
        return ret;
      }
    const Wait = async N =>
      {
        N = N|0;
        if (!N)
          while (run || wait || waits.length)
            await work();
        else if (N>0 || run>=-N)
          while ((await work())>=0 || --N>0);
        return ret;
      }

    // Sadly I found no good way to reuse things here
    // XXX TODO XXX implement with Revocable above!
    const Acquire = async (N,...a) =>
      {
        D('Acquire', N,a);
        let n = N === void 0 ? 1 : N|0;		// This works for classes with toString() returning nonnull integer
        if (!n && N!==0)	THROW(`.Acquire(${N}): nonnumeric`);
        if (n<0)		THROW('.Aquire(${n}): negative');

        for (;;)
          {
            const limit = (await get(N,...a))|0;	// passing N, not n
            if (!n && limit<=0)	THROW(`.Acquire(${n}): unlimited (.max is ${limit})`);
            if (n && limit<n)	THROW(`.Acquire(${n}): unsatisfyable (.max is ${limit})`);

            if (run < limit && run+n <= limit)
              return release_function(n ? n : limit-run);

            upd();
            D('Acquire', 'wait');
            await work();
            D('Acquire', 'cont');
          }
      }
    const ret = (..._) => next(new Promise((ok,ko) => waits.push([ok,ko,_])).then(() => (ret.fn ? ret.fn : (...a)=>a)(...ret.args,..._)).finally(() => next(upd(-1))));
    ret.max	= max;
    ret.fn	= fn;
    ret.args	= args;
    ret.cancel	= cancel;
    ret.stop	= () => { maxing = true; return ret };
    ret.start	= () => { if (maxing===true) maxing=false; return next(ret) }
    ret.try	= acquire;
    ret.Acquire	= Acquire;
    ret.Max	= Max;		// wait for max running
    ret.Min	= Min;		// wait for N started
    ret.Wait	= Wait;		// wait for N releases
//    ret.release	= release;	// I really have no good idea how to implement this the sane way in an async world
// XXX TODO XXX await sem.aquire(2) /* not saving return */; ..; sem.release(1); ..; sem.release(1); ..; sem.release(1) ==> throws
// XXX TODO XXX .abort() to abort running Promises (if there is some clever way)
    return ret;
  }
//S//
module.exports = Semaphore;
