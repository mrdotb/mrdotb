+++
title = 'Mkfifo'
date = '2020-11-16T21:21:21+01:00'
author = 'mrdotb'
description = 'How to use mkfifo ?'
tags = ['mkfifo', 'shell', 'til']
+++

mkfifo create a named pipe.
Opening a FIFO for reading normally blocks until some other process opens the
same FIFO for writing, and vice versa.

You need two shell.

Create the fifo

```bash
mkfifo /tmp/fifo1
```

Try to read from the fifo will block until we write inside

```bash
cat /tmp/fifo1
```

In the second shell write something in the fifo

```bash
echo "Hello fifo" > /tmp/fifo1
```

The cat from the first shell should have write `Hello fifo`
