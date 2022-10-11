+++
title = 'Probuild Ex Part three'
date = '2022-10-11T16:44:01+02:00'
author = 'mrdotb'
description = 'A league of legend probuilds with elixir phoenix, part three'
tags = ['elixir', 'phoenix', 'liveview', 'hook', 'ets', 'tutorial', 'ddragon']
toc = true
showReadingTime = true
cover = "/posts/probuild-ex-part-three/cover.png"
+++


## Intro

In [Part two](/posts/probuild-ex-part-two/) we build the data collection pipelines.
In this third part, we are going to create:
- A new context `App` to will hold the queries for the application
- A styled liveview with tailwind to display our controls and data nicely
- A [liveview hook](https://hexdocs.pm/phoenix_live_view/js-interop.html#client-hooks-via-phx-hook) to use [timeago.js](https://github.com/hustcc/timeago.js)
- A helper module to convert `champion_id` and `summoner_id` to league of legends images

Part three assumes that you have already gone through Part two and have the code at a point where we can jump right in. If you want to checkout the companion code and fast forward to this point, do the following:

```shell
git clone https://github.com/mrdotb/probuild_ex.git
cd probuild_ex
git checkout 9f3016f5992de0ad3bd8d90636f1d8ff25fd8508 
```

{{< newsletter >}}

## Have a peak 👀 at the end of series application
https://probuild.fly.dev/


## Install tailwindcss - [commit](https://github.com/mrdotb/probuild_ex/commit/f108bfbc9af79e8503c1884989c0d78a29ee1e08)

Edit `mix.exs`
```elixir
def deps do
  [
    ...
    {:tailwind, "~> 0.1.6", runtime: Mix.env() == :dev}
  ]
end

defp aliases do
  [
    ...
    "assets.deploy": ["tailwind default --minify", "esbuild default --minify", "phx.digest"]
  ]
end
```

Edit `config/config.exs`
```elixir
config :tailwind,
  version: "3.1.8",
  default: [
    args: ~w(
      --config=tailwind.config.js
      --input=css/app.css
      --output=../priv/static/assets/app.css
    ),
    cd: Path.expand("../assets", __DIR__)
  ]
```

Edit `config/dev.exs`
```elixir
config :probuild_ex, ProbuildExWeb.Endpoint,
  ...
  watchers: [
    # Start the esbuild watcher by calling Esbuild.install_and_run(:default, args)
    esbuild: {Esbuild, :install_and_run, [:default, ~w(--sourcemap=inline --watch)]}
    # Add tailwind watcher
    tailwind: {Tailwind, :install_and_run, [:default, ~w(--watch)]}
  ]
```

Run
```shell
mix tailwind.install
```
It will edit `assets/css/app.css` and `assets/js/app.js` and create `assets/tailwind.config.js`.

At this point we should be good to go let's try some tailwind classes.

edit `lib/probuild_ex_web/templates/page/index.html.heex` and replace the content
```html
<h1 class="text-3xl text-red-500 font-bold underline">Welcome to Phoenix!</h1>
```

Visit [http://localhost:4000](http://localhost:4000) we should see our `Welcome to Phoenix!` styled

{{< lightbox
  src="/posts/probuild-ex-part-three/1-tailwind-welcome.png"
  alt="tailwind welcome"
>}}

## Edit root layout add tailwindui nav - [commit](https://github.com/mrdotb/probuild_ex/commit/4bcf25c51963d3fad99b8f9e99df3c39554bcb55)

I took one of the nice navigation and layout from [tailwindui](https://tailwindui.com/)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <meta name="csrf-token" content={csrf_token_value()}>
    <%= live_title_tag assigns[:page_title] || "ProbuildEx", suffix: " · Phoenix Framework" %>
    <link phx-track-static rel="stylesheet" href={Routes.static_path(@conn, "/assets/app.css")}/>
    <script defer phx-track-static type="text/javascript" src={Routes.static_path(@conn, "/assets/app.js")}></script>
  </head>
  <body class="min-h-screen flex flex-col">
    <div class="flex-1 flex flex-col">
      <nav class="bg-indigo-600">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <span class="text-white font-bold">
                Probuild
                </span>
              </div>
              <div class="hidden md:block">
                <div class="ml-10 flex items-baseline space-x-4">
                  <!-- Current: "bg-indigo-700 text-white", Default: "text-white hover:bg-indigo-500 hover:bg-opacity-75" -->
                  <%= if function_exported?(Routes, :live_dashboard_path, 2) do %>
                    <%= link "LiveDashboard", to: Routes.live_dashboard_path(@conn, :home), class: "text-white hover:bg-indigo-500 hover:bg-opacity-75 px-3 py-2 rounded-md text-sm font-medium" %>
                  <% end %>
                </div>
              </div>
            </div>
            <div class="-mr-2 flex md:hidden">
              <!-- Mobile menu button -->
              <button id="toggle-menu" type="button" class="bg-indigo-600 inline-flex items-center justify-center p-2 rounded-md text-indigo-200 hover:text-white hover:bg-indigo-500 hover:bg-opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-indigo-600 focus:ring-white" aria-controls="mobile-menu" aria-expanded="false">
                <span class="sr-only">Open main menu</span>
                <!--
                  Heroicon name: outline/bars-3

                  Menu open: "hidden", Menu closed: "block"
                -->
                <svg id="burger" class="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
                <!--
                  Heroicon name: outline/x-mark

                  Menu open: "block", Menu closed: "hidden"
                -->
                <svg id="x-mark" class="hidden h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Mobile menu, show/hide based on menu state. -->
        <div class="hidden md:hidden" id="mobile-menu">
          <div class="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <!-- Current: "bg-indigo-700 text-white", Default: "text-white hover:bg-indigo-500 hover:bg-opacity-75" -->
            <%= if function_exported?(Routes, :live_dashboard_path, 2) do %>
              <%= link "LiveDashboard", to: Routes.live_dashboard_path(@conn, :home), class: "text-white hover:bg-indigo-500 hover:bg-opacity-75 block px-3 py-2 rounded-md text-base font-medium" %>
            <% end %>

          </div>
        </div>
      </nav>

      <main class="flex-1 bg-gray-100">
        <div class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <!-- Replace with your content -->
            <%= @inner_content %>
          <!-- /End replace -->
        </div>
      </main>
    </div>
  </body>
</html>
```

We need a bit of js to make the mobile navigation work.

Edit `assets/js/app.js` add
```javascript
// tailwind ui mobile nav
const $toggleMenu = document.getElementById("toggle-menu")
const $burger = document.getElementById("burger")
const $xMark = document.getElementById("x-mark")
const $mobileMenu = document.getElementById("mobile-menu")

$toggleMenu.addEventListener("click", event => {
  event.preventDefault();
  ["hidden", "block"].forEach(className => {
    $burger.classList.toggle(className)
    $xMark.classList.toggle(className)
  })
  $mobileMenu.classList.toggle("hidden")
})
```

Nothing complicate just some css class toggle when the `$toggleMenu` is clicked

Visit [http://localhost:4000](http://localhost:4000) we should see

{{< lightbox
  src="/posts/probuild-ex-part-three/2-setup-nav.png"
  alt="setup navigation in root layout"
>}}

## Create App context - [commit](https://github.com/mrdotb/probuild_ex/commit/e9ea111cbc37a1d58afbcbeb9ef872ba21af5c76)

We will create another context that will hold the queries for the application.

Create `lib/probuild_ex/app.ex`
```elixir
defmodule ProbuildEx.App do
  @moduledoc """
  The context module who hold the queries.
  """

  import Ecto.Query

  alias ProbuildEx.Repo

  alias ProbuildEx.Games.Participant

  def list_pro_participant_summoner(_opts) do
    query =
      from participant in Participant,
        left_join: game in assoc(participant, :game),
        left_join: summoner in assoc(participant, :summoner),
        left_join: opponent_participant in assoc(participant, :opponent_participant),
        inner_join: pro in assoc(summoner, :pro),
        preload: [
          game: game,
          opponent_participant: opponent_participant,
          summoner: {summoner, pro: pro}
        ],
        order_by: [desc: game.creation],
        limit: 20

    Repo.all(query)
  end
end
```

This query will get the participants that are linked to a pro player with all the relations we need preloaded.
Later we will use the `_opts` to filter the query according to what params the user provided on the liveview.

## Create live_view template and style - [commit](https://github.com/mrdotb/probuild_ex/commit/82ee4cdd36f0e3e60ea6afd0c737ff0cb2418466#diff-e0f59530456a14e6ab7723ad1fa1cf54324179f41071e852f50622e356a44f64)

We will setup the liveview.

In `lib/probuild_ex_web/router.ex` replace the `get "/", PageController, :index`
```elixir
defmodule ProbuildExWeb.Router do
  ...

  scope "/", ProbuildExWeb do
    pipe_through :browser

    live "/", GameLive.Index, :index
  end

  ...
end
```
Here we setup the live route to our `GameLive` view.

Create the folder `game_live`
```shell
mkdir -p lib/probuild_ex_web/live/game_live/
```

Create `lib/probuild_ex_web/live/game_live/index.ex`
```elixir
defmodule ProbuildExWeb.GameLive.Index do
  use ProbuildExWeb, :live_view

  alias ProbuildEx.App

  @impl true
  def mount(_params, _session, socket) do
    socket = assign(socket, participants: App.list_pro_participant_summoner([]))
    {:ok, socket}
  end

  @impl true
  def handle_params(params, _url, socket) do
    {:noreply, apply_action(socket, socket.assigns.live_action, params)}
  end

  defp apply_action(socket, :index, _params) do
    socket
  end
end
```
We use the query we did earlier and assigns the result to be used in the liveview. We will use the `apply_action` pattern for our liveview.

Create `lib/probuild_ex_web/live/game_live/index.html.heex`
```elixir
<div class="flex flex-col">
  <div class="flex justify-center">
    <div class="md:max-w-3xl w-full">
      <div class="px-2 md:px-0">
        <div class="w-full mt-1 relative rounded-full shadow-sm">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <!-- Heroicon name: magnifying-glass -->
            <svg class="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input type="search" name="search" id="search" class="py-4 px-5 focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-full" placeholder="Seach for a Champion or Pro Player">
        </div>
      </div>
    </div>
  </div>
  <div class="mt-3 flex flex-wrap justify-center">
    <span class="relative z-0 inline-flex shadow-sm rounded-md">
      <button type="button" class="relative inline-flex items-center px-3 py-1 md:px-4 md:py-2 rounded-l-md border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">All Roles</button>
      <button type="button" class="-ml-px relative inline-flex items-center px-3 py-1 md:px-4 md:py-2 border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">Top</button>
      <button type="button" class="-ml-px relative inline-flex items-center px-3 py-1 md:px-4 md:py-2 border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">Jungle</button>
      <button type="button" class="-ml-px relative inline-flex items-center px-3 py-1 md:px-4 md:py-2 border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">Middle</button>
      <button type="button" class="-ml-px relative inline-flex items-center px-3 py-1 md:px-4 md:py-2 border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">Utility</button>
      <button type="button" class="-ml-px relative inline-flex items-center px-3 py-1 md:px-4 md:py-2 rounded-r-md border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">Bottom</button>
    </span>
    <div>
      <select id="platform_id" name="platform_id" class="mt-1 md:mt-0 ml-2 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-xs md:text-sm rounded-md">
        <option selected>All regions</option>
        <option>EUW</option>
      </select>
    </div>
  </div>
  <div class="mt-4 flex flex-col items-center space-y-1">
    <div class="w-full max-w-3xl grid-participants-header px-1 py-2 text-xs">
      <div></div>
      <div>Pro player</div>
      <div class="flex justify-center">Matchup</div>
      <div class="flex justify-center">KDA</div>
      <div class="flex justify-center">Summoners</div>
      <div class="flex justify-center">Build</div>
    </div>
    <%= for participant <- @participants do %>
      <div id={"participant-#{participant.id}"} class={[if(participant.win, do: "border-blue-500", else: "border-red-500"), "hover:bg-gray-100 hover:cursor-pointer border-l-8 w-full max-w-3xl grid-participants px-1 py-2 bg-white rounded-lg overflow-hidden shadow"]}>
        <div class="grid-area-creation flex md:justify-center items-center">
          <%# TODO time ago %>
        </div>

        <div class="grid-area-player flex items-center">
          <!-- Heroicon name: user-circle -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8">
            <path fill-rule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clip-rule="evenodd" />
          </svg>
          <span class="flex-1 ml-1 text-ellipsis overflow-hidden">
            <%= participant.summoner.pro.name %>
          </span>
        </div>

        <div class="grid-area-versus flex justify-center items-center space-x-1">
          <img class="w-8 h-8 rounded-full" src="https://ddragon.leagueoflegends.com/cdn/12.16.1/img/champion/Gragas.png" alt="">
          <span>vs</span>
          <img class="w-8 h-8 rounded-full" src="https://ddragon.leagueoflegends.com/cdn/12.16.1/img/champion/Gragas.png" alt="">
        </div>

        <div class="grid-area-kda flex justify-center items-center">
          <span class="font-medium">
            <%= participant.kills %>
          </span>
          /
          <span class="font-medium text-red-500">
            <%= participant.deaths %>
          </span>
          /
          <span class="font-medium">
           <%= participant.assists %>
          </span>
        </div>

        <div class="grid-area-summoners flex justify-center items-center space-x-1">
          <img class="w-8 h-8 border-2 border-black" src="https://ddragon.leagueoflegends.com/cdn/12.16.1/img/spell/SummonerFlash.png" alt="">
          <img class="w-8 h-8 border-2 border-black" src="https://ddragon.leagueoflegends.com/cdn/12.16.1/img/spell/SummonerDot.png" alt="">
        </div>

        <div class="grid-area-build flex justify-center items-center space-x-1">
          <%= for _ <- 1..6 do %>
            <img class="w-8 h-8" src="https://ddragon.leagueoflegends.com/cdn/12.16.1/img/item/1001.png" alt="">
          <% end %>
        </div>

        <div class="grid-area-ellipsis hidden md:flex flex-1 justify-center items-center">
          <!-- Heroicon name: ellipsis-vertical -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
            <path fill-rule="evenodd" d="M4.5 12a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm6 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm6 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" clip-rule="evenodd" />
          </svg>
        </div>
      </div>
    <% end %>
  </div>
</div>
```

I took some components from [tailwindui](https://tailwindui.com/) to do the big search and buttons. The rows layout is a mix of [flexbox](https://tailwindcss.com/docs/flex) and [grid](https://tailwindcss.com/docs/display#grid). I found [grid-area](https://developer.mozilla.org/en-US/docs/Web/CSS/grid-area) to simplify the responsive version a lot but it's not supported by tailwind so we need to add some extra css.


Edit `assets/css/app.css`
```css
...
/* Custom grid for participants */

.grid-participants-header {
  display: none;
}
@media (min-width: theme('screens.md')) {
  .grid-participants-header {
    display: grid;
    grid-template-columns: 11% 17% 12% 10% 10% 35% 4%;
  }
}
.grid-participants {
  display: grid;
  grid-gap: 12px 0px;
  grid-template-rows: auto auto;
  grid-template-columns: 20% 20% 60%;
  grid-template-areas:
  "player kda versus"
  "creation summoners build";
}
@media (min-width: theme('screens.md')) {
  .grid-participants {
    grid-gap: 0px;
    grid-template-columns: 11% 17% 12% 10% 10% 35% 4%;
    grid-template-areas: "creation player versus kda summoners build ellipsis";
  }
}
.grid-area-creation {
  grid-area: creation;
}
.grid-area-player {
  grid-area: player;
}
.grid-area-versus {
  grid-area: versus;
}
.grid-area-kda {
  grid-area: kda;
}
.grid-area-summoners {
  grid-area: summoners;
}
.grid-area-build {
  grid-area: build;
}
.grid-area-ellipsis {
  grid-area: ellipsis;
}
```

Visit [http://localhost:4000](http://localhost:4000) we should see

{{< lightbox
  src="/posts/probuild-ex-part-three/3-probuild-rows.png"
  alt="probuild ex rows"
>}}

## Create time ago hook - [commit](https://github.com/mrdotb/probuild_ex/commit/8983396fd31d1785d3a157f502303ce8d27f55fd)

We want to display when the game was played. ex: (1h ago, 1m ago ...) I found the nice [timeago.js](https://github.com/hustcc/timeago.js) library.

Liveview come with [javascript hook](https://hexdocs.pm/phoenix_live_view/js-interop.html#client-hooks-via-phx-hook) and we will create one for timeago.js.

Let's add the timeago.js library to our vendors.
Create file `assets/vendor/timeago.js`
```javascript
/**
 * @license MIT
 * timeago.js 4.0.2
 * https://github.com/mrdotb/timeago.js
 * Copyright (c) 2016 Hust.cc
 */
!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):"function"==typeof define&&define.amd?define(["exports"],t):t((e=e||self).timeago={})}(this,function(e){"use strict";function t(e,t){n[e]=t}function r(e){return n[e]||n.en_US}var n={},a=[60,60,24,7,365/7/12,12];function o(e){return e instanceof Date?e:!isNaN(e)||/^\d+$/.test(e)?new Date(parseInt(e)):(e=(e||"").trim().replace(/\.\d+/,"").replace(/-/,"/").replace(/-/,"/").replace(/(\d)T(\d)/,"$1 $2").replace(/Z/," UTC").replace(/([+-]\d\d):?(\d\d)/," $1$2"),new Date(e))}function s(e,t){for(var n=e<0?1:0,r=e=Math.abs(e),o=0;e>=a[o]&&o<a.length;o++)e/=a[o];return(0===(o*=2)?9:1)<(e=Math.floor(e))&&(o+=1),t(e,o,r)[n].replace("%s",e.toString())}function u(e,t){return(+(t?o(t):new Date)-+o(e))/1e3}var c="timeago-id";function f(e){return parseInt(e.getAttribute(c))}var d={},g=function(e){clearTimeout(e),delete d[e]};function l(e,t,n,r){g(f(e));var o=r.relativeDate,i=r.minInterval,o=u(t,o),o=(e.innerText=s(o,n),setTimeout(function(){l(e,t,n,r)},Math.min(1e3*Math.max(function(e){for(var t=1,n=0,r=Math.abs(e);e>=a[n]&&n<a.length;n++)e/=a[n],t*=a[n];return r=(r%=t)?t-r:t,Math.ceil(r)}(o),i||1),2147483647)));d[o]=0,e.setAttribute(c,o)}t("en_short",function(e,t){return[["just now","right now"],["%ss ago","in %ss"],["1m ago","in 1m"],["%sm ago","in %sm"],["1h ago","in 1h"],["%sh ago","in %sh"],["1d ago","in 1d"],["%sd ago","in %sd"],["1w ago","in 1w"],["%sw ago","in %sw"],["1mo ago","in 1mo"],["%smo ago","in %smo"],["1yr ago","in 1yr"],["%syr ago","in %syr"]][t]}),e.cancel=function(e){e?g(f(e)):Object.keys(d).forEach(g)},e.format=function(e,t,n){return s(u(e,n&&n.relativeDate),r(t))},e.register=t,e.render=function(e,t,n){return(e=e.length?e:[e]).forEach(function(e){l(e,e.getAttribute("datetime"),r(t),n||{})}),e},Object.defineProperty(e,"__esModule",{value:!0})});
```

Edit `assets/js/app.js`
```javascript
import {render, cancel} from "../vendor/timeago.js"

let Hooks = {}
Hooks.TimeAgo = {
  mounted() {
    render(this.el, 'en_short')
  },
  updated() {
    render(this.el, 'en_short')
  },
  destroyed() {
    cancel(this.el)
  }
}

let csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content")
let liveSocket = new LiveSocket("/live", Socket, {hooks: Hooks, params: {_csrf_token: csrfToken}})
```

- We import `render` and `cancel` function from `timeago.js`
- Create a `Hooks` object
- Add `TimeAgo` object use three of the callbacks provided by the liveview hook:
  - `mounted` trigger timeago `render` when the element has been added to the DOM
  - `updated` trigger timeago `render` when the element has been updated in the DOM
  - `updated` trigger timeago `cancel` when the element has been removed from the DOM
- Add the `Hooks` object to the `LiveSocket` config


Now let's use the hook in our liveview template.

Edit `lib/probuild_ex_web/live/game_live/index.html.heex` replace `<%# TODO time ago %>`
```html
<time id={"time-ago-#{participant.id}"} phx-hook="TimeAgo" datetime={participant.game.creation}></time>
```
- We use the [`<time>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/time) html element.
- Hook require a unique id we created one using `participant_id`
- we set datetime attribute to `game.creation` timestamp it's the value timeago.js will read


We should get the time ago displayed nicely
{{< lightbox
  src="/posts/probuild-ex-part-three/5-timeago-hook.png"
  alt="timeago hook in action screenshot"
>}}


## Create Ddragon to get assets pictures - [commit](https://github.com/mrdotb/probuild_ex/commit/0633b54a6465bf73273074267ea57cb75c0b3dca)

Notice for know we put a placeholder for the champions summoners and items. In order to display the real one we need to convert `champion_id`, `summoner_id` and `item_id` to pictures. We will create a small api client to ddragon (the league of legend cdn) and a cache it using [ETS](https://elixir-lang.org/getting-started/mix-otp/ets.html).


Create the ddragon folder
```shell
mkdir lib/probuild_ex/ddragon
```

Create `lib/probuild_ex/ddragon/api.ex`
```elixir
defmodule ProbuildEx.Ddragon.Api do
  @moduledoc """
  A thin wrapper around the ddragon api for the endpoint we are interested in.
  """
  use Tesla, only: [:get]

  @local "en_US"

  plug Tesla.Middleware.BaseUrl, "https://ddragon.leagueoflegends.com"
  plug Tesla.Middleware.JSON
  plug Tesla.Middleware.Logger

  def fetch_champions(patch) do
    get("/cdn/#{patch}/data/#{@local}/champion.json")
  end

  def fetch_items(patch) do
    get("/cdn/#{patch}/data/#{@local}/item.json")
  end

  def fetch_summoners(patch) do
    get("/cdn/#{patch}/data/#{@local}/summoner.json")
  end

  def fetch_versions do
    get("/api/versions.json")
  end
end
```
We created a HTTP client to the ddragon cdn using [Tesla](https://hexdocs.pm/tesla/readme.html)


Now we will create a GenServer that use `ETS` as cache mechanism.
Create `lib/probuild_ex/ddragon/cache.ex`
```elixir
defmodule ProbuildEx.Ddragon.Cache do
  @moduledoc """
  Cache the call of the ddragon api in :ets and provide singular ressource
  fetch.
  """
  use GenServer, restart: :transient

  alias ProbuildEx.Ddragon.Api

  ## Client

  def start_link(_args) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  def fetch_champion_img(key) do
    GenServer.call(__MODULE__, {:fetch_champion_img, key})
  end

  def fetch_summoner_img(key) do
    GenServer.call(__MODULE__, {:fetch_summoner_img, key})
  end

  ## Server

  def init(_) do
    opts = [:set, :named_table, :public, read_concurrency: true]
    :ets.new(:champions, opts)
    :ets.new(:summoners, opts)

    {:ok, [], {:continue, :warmup}}
  end

  def handle_continue(:warmup, state) do
    request_and_cache_champions()
    request_and_cache_summoners()

    {:noreply, state}
  end

  def handle_call({:fetch_champion_img, champion_key}, _from, state) do
    response =
      case :ets.lookup(:champions, {:img, champion_key}) do
        [{_, champion_img}] ->
          {:ok, champion_img}

        [] ->
          {:error, :not_found}
      end

    {:reply, response, state}
  end

  def handle_call({:fetch_summoner_img, summoner_key}, _from, state) do
    response =
      case :ets.lookup(:summoners, {:img, summoner_key}) do
        [{_, summoner_img}] ->
          {:ok, summoner_img}

        [] ->
          {:error, :not_found}
      end

    {:reply, response, state}
  end

  defp request_and_cache_champions do
    with {:ok, %{body: versions}} <- Api.fetch_versions(),
         last_game_version <- List.first(versions),
         {:ok, %{body: champions_response}} <- Api.fetch_champions(last_game_version) do
      champions_img_map = create_champions_img_map(champions_response)

      Enum.each(champions_img_map, fn {key, img} ->
        :ets.insert(:champions, {{:img, key}, img})
      end)
    end
  end

  defp request_and_cache_summoners do
    with {:ok, %{body: versions}} <- Api.fetch_versions(),
         last_game_version <- List.first(versions),
         {:ok, %{body: summoners_response}} <- Api.fetch_summoners(last_game_version) do
      summoners_img_map = create_summoners_img_map(summoners_response)

      Enum.each(summoners_img_map, fn {key, img} ->
        :ets.insert(:summoners, {{:img, key}, img})
      end)
    end
  end

  defp create_champions_img_map(champions_response) do
    champions_response
    |> Map.get("data")
    |> Enum.map(fn {_champion_id, data} ->
      key = String.to_integer(data["key"])
      value = data["image"]["full"]
      {key, value}
    end)
    |> Map.new()
  end

  defp create_summoners_img_map(summoners_response) do
    summoners_response
    |> Map.get("data")
    |> Enum.map(fn {_summoner_id, data} ->
      key = String.to_integer(data["key"])
      value = data["image"]["full"]
      {key, value}
    end)
    |> Map.new()
  end
end
```

Let's go slowly. First, we make use of the `restart: :transient` option to be able to stop our GenServer under `:normal` condition.

Let's break what is happening:
- On Client:
  - `start_link/1` function don't need any args here. The GenServer will be started under the module name using `__MODULE__`
  - `fetch_champion_img/1` will receive a `champion_id` and return the name of to the champion image or an error if we can't find it
  - `fetch_summoner_img/1` will receive a `summoner_id` and return the name to the summoner image or an error if we can't find it
- On Server:
  - `init/1` create two `ETS` tables then call `warmup`
  - `handle_continue/2` will run the `request_and_cache_*/0` functions
  - `handle_call/2` `fetch_*_img` will do a `:ets.lookup` on the table and return the image of the ressource
  - `request_and_cache_*/2` we fetch the last versions of the game then we retrieve the ressource and insert it in the `ETS` table

Create `lib/probuild_ex/ddragon.ex`
```elixir
defmodule ProbuildEx.Ddragon do
  @moduledoc """
  Convenience to access ddragon.
  """
  alias ProbuildEx.Ddragon.Cache

  @ddragon_cdn "https://ddragon.leagueoflegends.com/cdn"

  @doc """
  Get a champion image given the game_version and champion_key.
  ## Example
    iex> Ddragon.get_champion_image("12.16.1", 1)
    "https://ddragon.leagueoflegends.com/cdn/12.16.1/img/champion/Annie.png"
  """
  def get_champion_image(game_version, champion_key) do
    case Cache.fetch_champion_img(champion_key) do
      {:ok, champion_img} ->
        "#{@ddragon_cdn}/#{game_version}/img/champion/#{champion_img}"

      {:error, _} ->
        nil
    end
  end

  @doc """
  Get a summoner image given the game_version and summoner_key.
  ## Example
    iex> Ddragon.get_summoner_image("12.16.1", 4)
    "https://ddragon.leagueoflegends.com/cdn/12.16.1/img/spell/SummonerFlash.png"
  """
  def get_summoner_image(game_version, summoner_key) do
    case Cache.fetch_summoner_img(summoner_key) do
      {:ok, summoner_img} ->
        "#{@ddragon_cdn}/#{game_version}/img/spell/#{summoner_img}"

      {:error, _} ->
        nil
    end
  end

  @doc """
  Get a summoner image given the game_version and summoner_key.
  ## Example
    iex> Ddragon.get_item_image("12.16.1", 1038)
    "https://ddragon.leagueoflegends.com/cdn/12.16.1/img/item/1038.png"
  """
  def get_item_image(game_version, item_key)
  def get_item_image(_game_version, 0), do: nil

  def get_item_image(game_version, item_key) do
    "#{@ddragon_cdn}/#{game_version}/img/item/#{item_key}.png"
  end
end
```
We made this helper module with three functions to get the image for a ressource.
In the end item url can be calculated easily with `item_id` only but it's not the case for champions and summoners.

Edit `lib/probuild_ex/application.ex`
```elixir
  def start(_type, _args) do
    children = [
      ...
      # Ddragon
      ProbuildEx.Ddragon.Cache
    ]
    ...
  end
```
We add the Cache to the list of children, when the application start requests to ddragon will be done and cached.

Edit `lib/probuild_ex_web/live/game_live/index.ex`
```elixir
...
alias ProbuildEx.Ddragon
...
```
We add an alias to `Ddragon` module on top of `GameLive.Index`

Edit `lib/probuild_ex_web/live/game_live/index.html.heex`
```html
...
<%= img_tag(Ddragon.get_champion_image(participant.game.version, participant.champion_id), class: "w-8 h-8 rounded-full") %>
<span>vs</span>
<%= img_tag(Ddragon.get_champion_image(participant.game.version, participant.opponent_participant.champion_id), class: "w-8 h-8 rounded-full") %>
...
<%= for summoner_key <- participant.summoners do %>
  <%= img_tag(Ddragon.get_summoner_image(participant.game.version, summoner_key), class: "w-8 h-8 border border-gray-400") %>
<% end %>
...
<%= for item_key <- participant.items do %>
  <%= if src = Ddragon.get_item_image(participant.game.version, item_key) do %>
    <img src={src} class="w-8 h-8" />
  <% else %>
    <div class="bg-gray-900 w-8 h-8 border border-gray-400"></div>
  <% end %>
<% end %>
...
```
We use our Ddragon module to convert the ressource id into images and replace the placeholder.

And now we should get our rows with proper images
{{< lightbox
  src="/posts/probuild-ex-part-three/4-rows-with-assets.png"
  alt="rows with assets"
>}}


## Closing thoughts

Well done and thanks for sticking with me to the end! We built the foundation for our liveview application.

In the next part we will work on the search query and the integration in our liveview:
- filter the query by `pro`, `platform_id`, `team_position`, `champion`
- paginate the query with [scrivener_ecto](https://github.com/drewolson/scrivener_ecto)
- make an infinite scroll with a liveview hook

Be sure to sign up to the newsletter so that you won't miss the next Part. Feel free to leave comments or feedback. I also appreciate if you can star ⭐ the companion code [repo](https://github.com/mrdotb/probuild_ex).

See you soon !
{{< newsletter >}}
