+++
title = 'curl no body only headers'
date = '2020-07-19T12:37:19.357Z'
author = 'mrdotb'
description = 'Empty the $ENV when calling external process'
tags = ['curl', 'shell', 'til']
toc = false
showReadingTime = false
+++

Sometimes you just want to check the headers the `-I` option is what you are looking for.
```shell
curl -Is http://ipinfo.io
> HTTP/1.1 200 OK
> access-control-allow-origin: *
> x-frame-options: SAMEORIGIN
> x-xss-protection: 1; mode=block
> x-content-type-options: nosniff
> referrer-policy: strict-origin-when-cross-origin
> content-type: application/json; charset=utf-8
> content-length: 306
> date: Mon, 27 Dec 2021 20:07:18 GMT
> x-envoy-upstream-service-time: 1
> vary: Accept-Encoding
> Via: 1.1 google

# Fetch the headers only
-I, --head

#Silent or quiet mode.
-s, --silent
```
