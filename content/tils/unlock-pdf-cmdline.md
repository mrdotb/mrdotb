+++
title = 'Unlock Pdf with cmd line'
date = '2022-06-03T00:00:58+02:00'
author = 'mrdotb'
description = 'Unlock pdf using cmd line tool'
tags = ['til', 'pdf', 'shell']
+++

## Unlock a pdf using cmd line

Sometimes you need to access a pdf which is password protected.

We can use [qpdf](https://github.com/qpdf/qpdf) to remove the password.

```shell
sudo apt install qpdf
qpdf --decrypt locked.pdf unlocked.pdf
```
