+++
title = 'Pass $ENV to awk'
date = '2020-12-16T21:21:21+01:00'
author = 'mrdotb'
description = 'Pass environment variable to awk'
tags = ['awk', 'shell', 'til']
+++

It's not possible to use env variable in awk but we can pass them like this.
```
export VAR=test
echo | awk -v env_var="$VAR" '{print "The value of VAR is " env_var}'
> The value of VAR is test
```
