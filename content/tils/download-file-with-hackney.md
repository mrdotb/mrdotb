+++
title = 'Download file with hackney'
date = '2021-05-19T12:37:19.357Z'
author = 'mrdotb'
description = 'Download file with hackney'
tags = ['elixir', 'erlang', 'til']
toc = false
showReadingTime = false
+++

# Download a file with hackney

Simply downloading a file with [hackney](https://github.com/benoitc/hackney)

```elixir
{:ok, _, _headers, ref} =
  :hackney.get(url, [{"Authorization", "Bearer token"}], "", [{:pool, :default}])

{:ok, body} = :hackney.body(ref)
File.write!(path, body, [:write, :binary])
```
