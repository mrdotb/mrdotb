+++
title = 'Measure Elixir Code Time Execution'
date = '2022-09-06T23:39:20+02:00'
author = 'mrdotb'
description = 'Measure elixir code time execution'
tags = ['til', 'elixir']
toc = false
showReadingTime = false
+++

If we want to measure the execution time of some elixir code.
We can use :timer.tc

```elixir
{time, _result} =
  :timer.tc(fn ->
    fun()
  end)

IO.puts("exec time in microsecond: #{time}")
```
