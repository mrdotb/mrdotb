+++
title = 'Empty system $ENV elixir'
date = '2020-07-19T12:37:19.357Z'
author = 'mrdotb'
description = 'Empty the $ENV when calling external process'
tags = ['elixir', 'erlang', 'til']
toc = false
showReadingTime = false
+++

By default when you start an external process the current system env is passed.

You can clean it using the following code.

```elixir
:os.getenv()
|> Enum.map(&(:string.split(&1, '=')))
|> Enum.map(&List.first(&1))
|> Enum.each(&(:os.unsetenv(&1)))
```
