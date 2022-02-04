/* Puzzle aspects are -2 to 2, so 3 aspects give 5*5*5=125 values.
 * To compress the CVEC into string we need 125 characters.
 *
 * We want to stay UTF-8 compatible and want to easily parse with Shell
 * - 00 NUL is not usable in Shell (end of C strings)
 * - 0a LF  is the line end character
 * - 08 TAB is the separator character
 * Hence we use all characters as-is, but replace
 * - 00 NUL by 7f DEL
 * - 0a LF  by 7e ~
 * - 08 TAB by 7d }
 * this way we can stuff this directly without any change into UTF-8
 * and easily parse it by Shell independently of UTF-8 support or not.
 *	IFS=$'\t' read -r data
 * which works even for older shells which do not support NUL lineendings.
 *
 * This Works is placed under the terms of the Copyright Less License,
 * see file COPYRIGHT.CLL.  USE AT OWN RISK, ABSOLUTELY NO WARRANTY.
 */

#include <stdio.h>
#include <stdint.h>
#include <limits.h>
#include <ctype.h>
#include <errno.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#include <puzzle.h>

#if 1
#define	DP(...)		do { debug_printf(__FILE__, __LINE__, __func__, __VA_ARGS__); } while (0)
static void
debug_printf(const char *file, int line, const char *fn, const char *msg, ...)
{
  va_list	list;

  va_start(list, msg);
  fprintf(stderr, "[[%s:%d: %s", file, line, fn);
  vfprintf(stderr, msg, list);
  fprintf(stderr, "]]\n");
  fflush(stderr);
}
#else
#define	DP	xDP
#endif
#define	xDP(...)	do { ; } while (0)

#define	__	struct _*_

struct _
  {
    PuzzleContext	P;
    PuzzleCvec		V;
    int			argc;
    char		**argv;
    int			lambdas;
    FILE		*in, *out;
    int			iline, oline;
    char		img[PATH_MAX];
  };

#define	OOPSv(v)	(char *)1, (va_list *)(&v)
#define	OOPSn(i)	(char *)2, (long long)(i)
#define	OOPSu(u)	(char *)3, (unsigned long long)(u)
#define	OOPSc(c)	(char *)4, (char)(c)

static void
OOPS_(__, va_list list)
{
  const char	*arg;

  while ((arg = va_arg(list, const char *))!=0)
    switch ((intptr_t)arg)
      {
      char	c;

      default:
        fprintf(stderr, " %s", arg);
        continue;

      case (intptr_t)1:	OOPS_(_, *va_arg(list, va_list *));				continue;
      case (intptr_t)2:	fprintf(stderr, " %lld", va_arg(list, long long));		continue;
      case (intptr_t)3:	fprintf(stderr, " %llu", va_arg(list, unsigned long long));	continue;
      case (intptr_t)4:
        c	= va_arg(list, int);
        if (isprint(c))
          fprintf(stderr, " '%c'", c);
        else
          fprintf(stderr, " 0x%02x", (unsigned char)c);
        continue;

      }
}

static void
OOPS(__, ...)
{
  va_list	list;
  int		e=errno;

  fprintf(stderr, "OOPS:");

  va_start(list, _);
  OOPS_(_, list);
  va_end(list);

  if (e)
    fprintf(stderr, ": %s", strerror(e));
  fprintf(stderr, "\n");

  exit(23);abort();for(;;);
}

static void
OOPSi(__, ...)
{
  va_list	list;

  va_start(list, _);
  OOPS(_, "line", OOPSn(_->iline), OOPSv(list), NULL);
  va_end(list);
}

static void *
alloc(__, size_t len)
{
  void	*tmp;

  tmp	= malloc(len);
  if (!tmp)
    OOPS(_, "out of memory", NULL);
  return tmp;
}

static void
init(__, int argc, char **argv, int lambdas)
{
  memset(_, 0, sizeof *_);

  _->argc	= argc;
  _->argv	= argv;
  _->lambdas	= lambdas;

  puzzle_init_context(&_->P);

  puzzle_set_lambdas(&_->P, lambdas);
  puzzle_set_max_width(&_->P, 30000);
  puzzle_set_max_height(&_->P, 30000);

  puzzle_init_cvec(&_->P, &_->V);

  _->in		= stdin;
  _->out	= stdout;
  _->iline	= 1;
  _->oline	= 1;
}

static void
deinit(__)
{
  puzzle_free_cvec(&_->P, &_->V);
  puzzle_free_context(&_->P);
}

static void
in_ungetc(__, char c)
{
  if (ungetc(c, _->in)==EOF)
    OOPSi(_, "cannot ungetc", OOPSc(c), NULL);
}

static int
in_eof(__)
{
  int	c;

  if ((c = fgetc(_->in))==EOF)
    return 1;
  in_ungetc(_, c);
  return 0;
}

static char
in_get(__, ...)
{
  int		c;
  va_list	list;

  if ((c = fgetc(_->in))==EOF)
    {
      va_start(list, _);
      OOPSi(_, "unexpected EOF:", OOPSv(list), NULL);
      va_end(list);
    }
  return c;
}

static char
in_peek(__, const char *msg, ...)
{
  va_list	list;
  char		c;

  va_start(list, msg);
  c	= in_get(_, OOPSv(list), NULL);
  va_end(list);
  in_ungetc(_, c);
  return c;
}

static int
in_if(__, char i)
{
  char	c;

  c	= in_get(_, "unexpected EOF", NULL);
  if (c == i)
    return 1;
  in_ungetc(_, c);
  return 0;
}

static int
in_hex(__, const char *msg, ...)
{
  int		c;
  va_list	list;

  va_start(list, msg);
  c	= in_get(_, "expected hex digit", list, NULL);
  if (c>='0' && c<='9')
    return c-'0';
  if (c>='a' && c<='f')
    return c-'a'+10;
  if (c>='A' && c<='F')
    return c-'A'+10;
  OOPSi(_, "expected hex digit, not char", OOPSc(c), list, NULL);
  return 0;	/* make compiler happy	*/
}

static void
in_C(__, char c)
{
  char	g;

  g	= in_get(_, "expected char", OOPSc(c), NULL);
  if (g != c)
    OOPSi(_, "unexpected char", OOPSc(g), "expected", OOPSc(c), NULL);
}

static void
in_sep(__)
{
  in_C(_, '\t');
}

static void
out_flush(__)
{
  fflush(stdout);
}

static void
out_sep(__)
{
  putchar('\t');
}

static void
in_lf(__)
{
  in_C(_, '\n');
  _->iline++;
}

static void
out_lf(__)
{
  putchar('\n');
}

static void
in_s(__, char *s, size_t max)
{
  char	c;
  int	i;

  for (i=0; i<max; s[i++]=c)
    {
      c	= in_get(_, "reading a name", NULL);
      if (c=='\n' || c=='\t')
        {
          s[i]	= 0;
          return in_ungetc(_, c);
        }
      if (!isprint(c))
        OOPSi(_, "unexpected char", OOPSc(c), "reading a name", NULL);
      if (c == '\\')
        {
          c	= in_get(_, "in escape reading a name", NULL);
          if (c!='\\')
            continue;
          if (c!='x')
            OOPSi(_, "expected '\\' or 'x', not char", OOPSc(c), "in escape reading a name", NULL);
          c	= in_hex(_, "in escape reading a name", NULL);
          c	= in_hex(_, "in escape reading a name", NULL) + c*16;
          if (!c)
            OOPSi(_, "NUL encountered", NULL);
        }
    }
  OOPSi(_, "exceeded maximum name length", OOPSn(max), NULL);
}

static void
out_s(__, const char *s)
{
  for (; *s; s++)
    {
      if (isprint(*s))
        {
          if (*s == '\\')
            putchar('\\');
          putchar(*s);
          continue;
        }
      printf("\\x%02x", (unsigned char)*s);
    }
}

static char
in_c(__, char c)
{
  switch (c)
    {
    case 127:	return 0;
    case 126:	return '\n';
    case 125:	return '\t';

    default:	if (c>0) return c;	/* intentional fallthroug	*/
    case '\n':
    case '\t':
    case 0:
      break;
    }
  OOPSi(_, "unexpected character", OOPSc(c), NULL);
  return 0;	/* make compiler happy	*/
}

static void
out_c(__, unsigned char c)
{
  switch (c)
    {
    case '\0':	c=127; break;
    case '\n':	c=126; break;
    case '\t':	c=125; break;
    }
  putchar(c);
}

static void
in_v(__, PuzzleCvec *v)
{
  int	i;
  signed char	*ptr;
  char	c;
  size_t max = _->P.puzzle_lambdas * _->P.puzzle_lambdas * 8 + 3;	/* WTF?!?  How to calculate that?	*/

  if (v->sizeof_vec < max)
    {
      puzzle_free_cvec(&_->P, v);
      puzzle_init_cvec(&_->P, v);
      if (v->vec || v->sizeof_vec) OOPSi(_, "internal error", NULL);
      v->vec		= alloc(_, max * sizeof *v->vec);
      v->sizeof_vec	= max;
    }

  max	-= 2;
  ptr	= v->vec;
  for (i=0; (c = in_get(_, "missing vector data or TAB", NULL))!='\t'; i+=3)
    {
      c	= in_c(_, c);
      if (i>=max) continue;

#define	I(A,v)	ptr[A] = ((v%5)-2)
      I(0, c/25);
      I(1, c/5);
      I(2, c);
#undef I
      ptr	+= 3;
    }
  if (i > max) OOPSi(_, "maximum vector length",OOPSn(max),"exceeded:", OOPSn(i), ": increase lamdbas?", NULL);
  switch (*--ptr += 2)
    {
    default:	OOPSi(_, "wrong vector data stuffing, must be 1..3", OOPSn(*ptr), NULL);
    case 1:
    case 2:
    case 3:
      i	-= *ptr;
      break;
    }
  v->sizeof_vec	= i;
  xDP("(%d)", v->sizeof_vec);
}

static void
out_v(__, signed char *ptr, int i, int padding)
{
  xDP("(%d)", i);
#define	O(A)	(ptr[A]+2)
  for (; (i-=3)>=0; ptr+=3)
    out_c(_, 25*O(0) + 5*O(1) + O(2));
  switch (i)
    {
    case 0:	if (padding) out_c(_,      33);	break;	/* 33 mod 5 == 3	*/
    case -1:	out_c(_, 25*O(0) + 5*O(1) + 1);	break;	/* padding does not hurt here	*/
    case -2:	out_c(_, 25*O(0) +          2);	break;
    }
#undef O
}

static void
in_cvec(__, char *img, size_t max)
{
  in_C(_, 'V');
  in_sep(_);
  in_v(_, &_->V);
  /* ^^^ does in_sep(_) as a sideeffect */
  in_s(_, img, max);
  in_lf(_);
}

static void
out_cvec(__, const char *img)
{
  out_c(_, 'V');
  out_sep(_);
  out_v(_, _->V.vec, _->V.sizeof_vec, 1);
  out_sep(_);
  out_s(_, img);
  out_lf(_);
}

static void
out_d(__, double d)
{
  printf("%F", d);
}

void
_gen(__, const char *img)
{
  if (puzzle_fill_cvec_from_file(&_->P, &_->V, img))
    OOPS(_, "cannot read", img, NULL);
  out_cvec(_, img);
}

void
read_lines(__, char c, void (*fn)(__, const char *))
{
  char	buf[PATH_MAX];
  int	fill, line;

  for (fill=line=0;; )
    {
      int	i, j, max;

      for (i=j=0; i<fill; i++)
        {
          if (buf[i] != c)
            if (buf[i])
              continue;
          buf[i]	= 0;
          if (buf[j])		/* ignore empty lines	*/
            fn(_, buf+j);
          j = i+1;
          line++;
        }
      if (j)
        {
          fill	-= j;
          if (fill)
            memmove(buf, buf+j, fill);
        }
      else if (feof(stdin))
        OOPS(_, "line", OOPSn(line), "ignored: unterminated last line", NULL);

      max	= (sizeof buf)-fill;
      if (max<=0)
        OOPS(_, "line", OOPSn(line), "too long", NULL);
      fill += fread(buf+fill, (size_t)1, (size_t)(max), stdin);
      if (ferror(stdin))
        OOPS(_, "line", OOPSn(line), "read error", NULL);
      if (feof(stdin) && !fill)
        break;
    }
}

void
gen(__, const char *img)
{
  char	c;

  if (strcmp(img, "0"))
    {
      if (strcmp(img, "-"))
        return _gen(_, img);
      c	= '\n';
    }
  else
    c	= 0;
  read_lines(_, c, _gen);
}

static void
out_P(__)
{
  printf("P%d\n", (int)_->lambdas);
}

static int
imgs(__)
{
  out_P(_);
  while (*_->argv)
    gen(_, *_->argv++);
  return 0;
}

static int
getnum(__, const char *buf, ...)
{
  unsigned long long	v;
  char			*end;
  va_list		list;

  va_start(list, buf);

  end	= 0;
  v	= strtoull(buf, &end, 0);

  if (!end || *end)
    OOPS(_, "not a valid number:", OOPSv(list), NULL);
  if (v != (unsigned long long)(int)v)
    OOPS(_, "out of range", OOPSv(list), NULL);
  va_end(list);

  return v;
}

static int
getint(__, int n, int def)
{
  return n >= _->argc ? def : getnum(_, _->argv[n], "argument", OOPSn(n), _->argv[n], NULL);
}

static int
in_N(__)
{
  char	buf[100];

  in_s(_, buf, sizeof buf);
  return getnum(_, buf, "line", OOPSn(_->iline), buf, NULL);
}

static void
in_params(__)
{
  if (in_if(_, 'P'))
    {
      _->lambdas	= in_N(_);
      puzzle_set_lambdas(&_->P, _->lambdas);
      if (in_if(_, '\t'))
        {
          while (!in_if(_, '\n'));
          in_ungetc(_, '\n');	/* hack	*/
        }
      in_lf(_);	/* increment line	*/
    }
}

static int
sig(__)
{
  char		img[PATH_MAX];
  int		N, M;
  signed char	sig[25];

  N	= getint(_, 0, 30);
  M	= getint(_, 1, 12);
  if (N>100000 || M>sizeof sig || N*M > 1000000)	/* upper range is somewhat arbitrary	*/
    OOPS(_, "argments too high", NULL);
  if (N<10 || M<3 || (N-1)*(M-1) < sizeof _->V.sizeof_vec)
    OOPS(_, "argments too low", NULL);
  in_params(_);
  out_P(_);
  while (!in_eof(_))
    {
      int	size, max, i, j, b;

      in_cvec(_, img, sizeof img);
      size	= _->V.sizeof_vec;
      max	= size<N ? size : N;
      for (i=0; i<max; i++)
        {
          b	= size * i / max;
          for (j=M; --j>=0; )
            sig[j]	= _->V.vec[ (b+j) % size ];
          out_c(_, 'S');
          out_sep(_);
          out_v(_, sig, M, 0);
          out_sep(_);
          out_s(_, img);
          out_lf(_);
        }
    }
  return 0;
}

static void
_cmp(__, const char *img)
{
  PuzzleCvec	V, *v;
  double	d;
  int		first;

  first	= 1;
  if ((v = &_->V)->vec)
    {
      v	= &V;
      puzzle_init_cvec(&_->P, v);
      first = 0;
    }

  if (puzzle_fill_cvec_from_file(&_->P, v, img))
    OOPS(_, "cannot read", img, NULL);
  if (first)
    return;

  d = puzzle_vector_normalized_distance(&_->P, &_->V, v, 1);
  puzzle_free_cvec(&_->P, v);

  out_d(_, d);
  out_sep(_);
  out_s(_, img);
  out_lf(_);
  out_flush(_);
}

static void
cmp(__, const char *img)
{
  char	c;

  c	= 0;
  if (strcmp(img, "0"))
    {
      if (strcmp(img, "-"))
        return _cmp(_, img);
      c	= '\n';
    }
  read_lines(_, c, _cmp);
}

static int
cmps(__)
{
  while (*_->argv)
    cmp(_, *_->argv++);
  return 0;
}


static void
lambdas(__)
{
  unsigned long	u;
  char		*end;

  u	= strtoul(_->argv[0], &end, 10);
  if (!end || *end || u<3 || u>255)
    OOPS(_, "wrong lamdba value:", _->argv[0], OOPSu(u), NULL);

  deinit(_);
  init(_, _->argc-2, _->argv+2, (int)u);
}

int
main(int argc, char **argv)
{
  static struct _ CONF;
  __ = &CONF;

  init(_, argc-2, argv+2, 9);

  /* for some unknown reason, puzzle_set_lamdbas() has no effect	*/
  if (_->argc>0 && !strcmp("lambdas", _->argv[-1]))	lambdas(_);

  if (_->argc> 0 && !strcmp("gen", _->argv[-1]))		return imgs(_);
  if (_->argc>=0 && !strcmp("sig", _->argv[-1]) && _->argc<3)	return sig(_);
  if (_->argc> 0 && !strcmp("cmp", _->argv[-1]))		return cmps(_);

  fprintf(stderr,
          "Usage: %s [lambdas N] gen|sig|cmp args..\n"
          "	gen img..\n"
          "		create vectors for img\n"
          "		use 'gen -' to read lines from STDIN\n"
          "		use 'gen 0' to read NUL terminated strings from STDIN\n"
          "	sig N M\n"
          "		create N signatures of length M from output of 'gen'\n"
          "		default N=30 M=12\n"
          "	cmp img..\n"
          "		compare images from stdin\n"
          "		the first image is compared to all others\n"
          "		you can use 'cmp -' and 'cmp 0' as in gen\n"
          "data format:\n"
          "	Process parameters:         Plambda(tabopt)..\n"
          "	gen single  line  per file: V(tab)vectordata(tab)filename\n"
          "	sig ordered lines per file: S(tab)signature(tab)filename\n"
          "	cmp image thesholds:        Tthreshold(tab)filename\n"
          , argv[0]);
  return 42;
}

