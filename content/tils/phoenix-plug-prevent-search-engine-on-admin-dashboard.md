+++
title = 'A phoenix plug to prevent search engine on specific page'
date = '2022-12-31T13:31:13.003944Z'
author = 'mrdotb'
description = 'Prevent search engine on specific page using the X-Robots-tag header'
tags = ['elixir', 'phoenix', 'plug', 'seo']
+++

For a current project I needed to prevent search engine to index the admin dashboard.

There is different way to achieve that. The method I found the most conveniant with phoenix is to add a `X-Robots-tag` header using a plug.

The `X-Robots-tag` header can take several value the one we are intrested are:
- **noindex** *Do not show this page, media, or resource in search results. If you don't specify this directive, the page, media, or resource may be indexed and shown in search results.*
- **nofollow** *Do not follow the links on this page. If you don't specify this directive, Google may use the links on the page to discover those linked pages. Learn more about nofollow.*

First, create a new module in your phoenix app.
```elixir
defmodule AppWeb.NoIndexPlug do
  @moduledoc """
  A Plug to add the the X-Robots-Tag: noindex, nofollow
  Read more on
  https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
  """

  @behaviour Plug

  def init(_params), do: nil

  def call(conn, _params) do
    Plug.Conn.put_resp_header(conn, "X-Robots-Tag", "noindex, nofollow")
  end
end
```

Add the plug in your router.
```elixir
defmodule AppWeb.Router do

  ...

  pipeline :admin do
    plug AppWeb.NoIndexPlug
    plug :browser
  end

  ...

  scope "/admin", AppWeb do
    pipe_through :admin

    live "/", AdminLive.Index, :index

    ...
  end
end
```

Let's verify using a `curl` that the header is here. *We use `-I` option to only return headers*
```shell
curl -I http://localhost:4000/admin
> HTTP/1.1 200 OK
> X-Robots-Tag: noindex, nofollow
...
```

Sucess !

Read more about robots directives here https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
