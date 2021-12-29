+++
title = 'Scroll event reach max scroll Y'
date = '2020-05-07T12:37:19.357Z'
author = 'mrdotb'
description = 'JS when we reach the end of the Y scroll'
tags = ['javascript', 'til']
toc = false
showReadingTime = false
+++

Usefull to know when we reach the end of scroll.

```javascript
const $box = document.querySelector('scroll-element')

$box.addEventListener('scroll', event => {
  const target = event.target

  const maxScrollY = target.scrollHeight - target.clientHeight

  if (maxScrollY === target.scrollTop) {
    // We reach the maximum of scroll Y
  }
})

```

