+++
title = 'Show octal permissions of file or folder'
date = '2020-11-13T21:21:21+01:00'
author = 'mrdotb'
description = 'Show octal permissions of file or folder'
tags = ['shell', 'til']
+++

You want to show octal permission of a file or a folder.
Use `stat`

```shell
stat -c "%a" file
> 664
stat -c "%a %A %n" file
> 664 -rw-rw-r-- readme.md
```

This alias is handy.
```shell
alias octal="stat -c '%a %A %n'"
```
