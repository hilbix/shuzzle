#

SRCS=$(wildcard *.c)
PROG=$(basename $(SRCS))
CFLAGS=-Wall -O3 -Wno-unused-function
LDLIBS=-lpuzzle

.PHONY:	love
love:	all

.PHONY:	all
all:	$(PROG)

.PHONY:	clean
clean:
	$(RM) $(PROG) *.o

#$(PROG).o:	$(wildcard h/*.h)

