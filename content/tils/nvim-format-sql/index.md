+++
title = 'Nvim Format Sql'
date = '2023-01-31T09:47:04+01:00'
author = 'mrdotb'
description = 'Format sql in nvim using range and pgFormatter cli'
tags = ['til', 'nvim', 'sql']
cover = "/tils/nvim-format-sql/cover.jpg"
+++

I was looking for a way to format my sql in nvim directly.

I found a nice cli called [pgFormatter](https://github.com/darold/pgFormatter)

On mac you can install it with [brew](https://formulae.brew.sh/formula/pgformatter)
```shell
brew install pgformatter
```

In my case I use a linux distrib based on [ubuntu](https://ubuntu.com/)
```shell
sudo apt-get install libcgi-pm-perl
cd /tmp
export version=5.4
wget https://github.com/darold/pgFormatter/archive/refs/tags/v${version}.tar.gz
tar xzf v${version}.tar.gz
cd pgFormatter-${version}/
perl Makefile.PL
make && sudo make install
```

After that you can use a [range](https://vim.fandom.com/wiki/Ranges) and called the external cli `pg_format` with `!`
```shell
# called pg_format on the current line
:.!pg_format
# called pg_format on the visually select lines
:'<,'>!pg_format
#:{range}!pg_format
```

In action
{{< youtube mvQeEaK7j_g >}}
