+++
title = 'Probuild Ex Part five'
date = '2022-10-24T16:44:01+02:00'
author = 'mrdotb'
description = 'A league of legend probuilds with elixir phoenix, part five'
tags = ['elixir', 'phoenix', 'liveview', 'tutorial', 'riot api']
toc = true
showReadingTime = true
cover = "/posts/probuild-ex-part-five/cover.png"
+++

## Intro

In [Part four](/posts/probuild-ex-part-four/) we implemented the search feature on our liveview.
In this fifth and final part we are going to:
- Create a new query to `fetch_game` with details in our context `App`
- Create a bunch of function components to origanise and reuse markups
- Create a live component `RowComponent`


Part five assumes that you have already gone through [Part four](/posts/probuild-ex-part-four/) and have the code at a point where we can jump right in. If you want to checkout the companion code and fast forward to this point, do the following:

```shell
git clone https://github.com/mrdotb/probuild_ex.git
cd probuild_ex
git checkout eb78ead3d201c1c74478001e728de3198c8b5a7b 
```


{{< newsletter >}}

## App fetch_game in details - [commit](https://github.com/mrdotb/probuild_ex/commit/6ce55d956e88f560b12304c27f20c6ed17d552fb)

Edit `lib/probuild_ex/app.ex`
```elixir
defmodule ProbuildEx.App do
  ...
  alias ProbuildEx.Games.{Game, Participant}
  ...
  @doc """
  Fetch game complete per game_id.
  """
  def fetch_game(game_id) do
    query =
      from game in Game,
        left_join: participants in assoc(game, :participants),
        left_join: summoners in assoc(participants, :summoner),
        preload: [
          participants: {participants, summoner: summoners}
        ],
        where: game.id == ^game_id,
        order_by: [
          asc: participants.team_id,
          asc:
            fragment(
              "array_position(ARRAY['TOP', 'JUNGLE', 'MIDDLE', 'TOP', 'UTILITY'], ?)",
              participants.team_position
            )
        ]

    case Repo.one(query) do
      nil -> {:error, :not_found}
      game -> {:ok, game}
    end
  end
end
```
The idea here is to get a game with the ten participants and their summoner organized by `team_id` and `team_position`. We are using postgres [array_position](array_position) in a [ecto fragment](https://hexdocs.pm/ecto/Ecto.Query.html#module-fragments) to sort per `team_position`.


Let's add some simple test to our `fetch_game/1` function.
Edit `test/probuild_ex/app_test.exs`
```elixir
defmodule ProbuildEx.AppTest do
  ...
  describe "game" do
    ...
    test "fetch_game/1 should return a game" do
      {:ok, multi} = create_weiwei_game()
      assert {:ok, _game} = App.fetch_game(multi.game.id)
    end

    test "fetch_game/1 should return an error" do
      assert {:error, :not_found} = App.fetch_game(1337)
    end
  end
end
```

## App game details - [commit](https://github.com/mrdotb/probuild_ex/commit/052cec3563e6e0770af6aac905e72a6f6e17a158)

{{< lightbox
  src="/posts/probuild-ex-part-five/1-app-diagram.png"
  alt="probuild ex UI diagram"
>}}

We will do the game details that appear when a row is clicked. But first because we we can reuse some markup for game details we will create two modules of dumb components `DdragonComponent` and `GridElementComponent`.


### Simple components

Create `lib/probuild_ex_web/live/game_live/ddragon_component.ex`
```elixir
defmodule ProbuildExWeb.GameLive.DdragonComponent do
  @moduledoc false

  use Phoenix.Component

  alias ProbuildEx.Ddragon

  def champion(assigns) do
    ~H"""
    <div class="w-8 h-8 rounded-full overflow-hidden bg-gray-900">
      <img src={Ddragon.get_champion_image(@game_version, @champion_id)} class="w-full" />
    </div>
    """
  end

  def summoner(assigns) do
    ~H"""
    <div class="w-8 h-8 rounded-full overflow-hidden bg-gray-900">
      <img src={Ddragon.get_summoner_image(@game_version, @summoner_key)} class="w-full" />
    </div>
    """
  end

  def item(assigns) do
    ~H"""
    <div class="bg-gray-900 w-8 h-8 border border-gray-400">
      <%= if src = Ddragon.get_item_image(@game_version, @item_key) do %>
        <img src={src} class="w-full" />
      <% end %>
    </div>
    """
  end

  def spinner(assigns) do
    ~H"""
    <img class={if not @load?, do: "invisible"} src="https://developer.riotgames.com/static/img/katarina.55a01cf0560a.gif" />
    """
  end
end
```
We put all the components related to `Ddragon`. Other than that nothing fancy it's simple [`Phoenix.Component`](https://hexdocs.pm/phoenix_live_view/Phoenix.Component.html) than return markup.

Create `lib/probuild_ex_web/live/game_live/grid_element_component.ex`
```elixir
defmodule ProbuildExWeb.GameLive.GridElementComponent do
  @moduledoc false

  use Phoenix.Component

  import ProbuildExWeb.GameLive.DdragonComponent

  def time_ago(assigns) do
    ~H"""
    <div class="grid-area-creation flex md:justify-center items-center">
      <time id={["time", to_string(@participant_id)]} phx-hook="TimeAgo" datetime={@game_creation}></time>
    </div>
    """
  end

  def pro_name(assigns) do
    ~H"""
    <div class="grid-area-player flex items-center">
      <!-- Heroicon name: user-circle -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8">
        <path fill-rule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clip-rule="evenodd" />
      </svg>
      <span class="flex-1 ml-1 text-ellipsis overflow-hidden">
        <%= @pro_name %>
      </span>
    </div>
    """
  end

  def versus(assigns) do
    ~H"""
    <div class="grid-area-versus flex justify-center items-center space-x-1">
      <.champion game_version={@game_version} champion_id={@champion_id} />
      <span>vs</span>
      <.champion game_version={@game_version} champion_id={@opponent_champion_id} />
    </div>
    """
  end

  def kda(assigns) do
    ~H"""
    <div class="grid-area-kda flex justify-center items-center">
      <span class="font-medium">
        <%= @kills %>
      </span>
      /
      <span class="font-medium text-red-500">
        <%= @deaths %>
      </span>
      /
      <span class="font-medium">
       <%= @assists %>
      </span>
    </div>
    """
  end

  def summoners(assigns) do
    ~H"""
    <div class="grid-area-summoners flex justify-center items-center space-x-1">
      <%= for summoner_key <- @summoners do %>
        <.summoner game_version={@game_version} summoner_key={summoner_key} />
      <% end %>
    </div>
    """
  end

  def items(assigns) do
    ~H"""
    <div class="grid-area-build flex justify-center items-center space-x-1">
      <%= for item_key <- @items do %>
        <.item game_version={@game_version} item_key={item_key} />
      <% end %>
    </div>
    """
  end

  def ellipsis(assigns) do
    ~H"""
    <div class="grid-area-ellipsis hidden md:flex flex-1 justify-center items-center">
      <!-- Heroicon name: ellipsis-vertical -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
        <path fill-rule="evenodd" d="M4.5 12a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm6 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm6 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" clip-rule="evenodd" />
      </svg>
    </div>
    """
  end

  def champion_block(assigns) do
    ~H"""
    <div class="grid-area-champion">
      <.champion game_version={@game_version} champion_id={@champion_id} />
    </div>
    """
  end

  def summoner_champion(assigns) do
    ~H"""
    <div class="grid-area-summoner-name flex items-center">
      <.champion game_version={@game_version} champion_id={@champion_id} />
      <span class="ml-1 text-ellipsis overflow-hidden whitespace-nowrap">
        <%= @summoner_name %>
      </span>
    </div>
    """
  end

  def gold_earned(assigns) do
    ~H"""
    <div class="grid-area-gold flex justify-center items-center text-yellow-600">
      <%= @gold_earned %>
    </div>
    """
  end
end
```
We break up each element in our row into a function, some elements can be used in Game and Game details. Other than that it's simple [`Phoenix.Component`](https://hexdocs.pm/phoenix_live_view/Phoenix.Component.html) again.

### RowComponent

For game details we will need another css grid.

Replace your `assets/css/app.css`
```css
/* This file is for your main application CSS */
@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";

/* Custom grids */
.grid-participants-header {
  display: none;
}
@media (min-width: theme('screens.md')) {
  .grid-participants-header {
    display: grid;
    grid-template-columns: 11% 17% 12% 10% 10% 35% 4%;
  }
  .grid-team-participants-header {
    display: grid;
    grid-template-columns: 25% 11% 12% 12% 40%;
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
.grid-team-participants {
  display: grid;
  grid-gap: 3px 0px;
  grid-template-rows: auto auto;
  grid-template-columns: 60% 20% 20%;
  grid-template-areas:
  "summoner-champion kda summoners"
  "build . gold";
}
@media (min-width: theme('screens.md')) {
  .grid-participants {
    grid-gap: 0px;
    grid-template-columns: 11% 17% 12% 10% 10% 35% 4%;
    grid-template-areas: "creation player versus kda summoners build ellipsis";
  }
  .grid-team-participants {
    grid-gap: 0px;
    grid-template-columns: 25% 11% 12% 12% 40%;
    grid-template-areas: "summoner-champion summoners kda gold build ";
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
.grid-area-summoner-champion {
  grid-area: summoner-champion;
}
.grid-area-gold {
  grid-area: gold;
}

/* Alerts and form errors used by phx.new */
.alert {
  padding: 15px;
  margin-bottom: 20px;
  border: 1px solid transparent;
  border-radius: 4px;
}
.alert-info {
  color: #31708f;
  background-color: #d9edf7;
  border-color: #bce8f1;
}
.alert-warning {
  color: #8a6d3b;
  background-color: #fcf8e3;
  border-color: #faebcc;
}
.alert-danger {
  color: #a94442;
  background-color: #f2dede;
  border-color: #ebccd1;
}
.alert p {
  margin-bottom: 0;
}
.alert:empty {
  display: none;
}
.invalid-feedback {
  color: #a94442;
  display: block;
  margin: -1rem 0 2rem;
}

/* LiveView specific classes for your customization */
.phx-no-feedback.invalid-feedback,
.phx-no-feedback .invalid-feedback {
  display: none;
}

.phx-click-loading {
  opacity: 0.5;
  transition: opacity 1s ease-out;
}

.phx-loading{
  cursor: wait;
}

.phx-modal {
  opacity: 1!important;
  position: fixed;
  z-index: 1;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  background-color: rgba(0,0,0,0.4);
}

.phx-modal-content {
  background-color: #fefefe;
  margin: 15vh auto;
  padding: 20px;
  border: 1px solid #888;
  width: 80%;
}

.phx-modal-close {
  color: #aaa;
  float: right;
  font-size: 28px;
  font-weight: bold;
}

.phx-modal-close:hover,
.phx-modal-close:focus {
  color: black;
  text-decoration: none;
  cursor: pointer;
}

.fade-in-scale {
  animation: 0.2s ease-in 0s normal forwards 1 fade-in-scale-keys;
}

.fade-out-scale {
  animation: 0.2s ease-out 0s normal forwards 1 fade-out-scale-keys;
}

.fade-in {
  animation: 0.2s ease-out 0s normal forwards 1 fade-in-keys;
}
.fade-out {
  animation: 0.2s ease-out 0s normal forwards 1 fade-out-keys;
}

@keyframes fade-in-scale-keys{
  0% { scale: 0.95; opacity: 0; }
  100% { scale: 1.0; opacity: 1; }
}

@keyframes fade-out-scale-keys{
  0% { scale: 1.0; opacity: 1; }
  100% { scale: 0.95; opacity: 0; }
}

@keyframes fade-in-keys{
  0% { opacity: 0; }
  100% { opacity: 1; }
}

@keyframes fade-out-keys{
  0% { opacity: 1; }
  100% { opacity: 0; }
}
```

I use [grid-area](https://developer.mozilla.org/en-US/docs/Web/CSS/grid-area) again it simplify the responsive version but it's not supported by tailwind yet so we need to add some extra css.

Create `lib/probuild_ex_web/live/game_live/row_component.ex`
```elixir
defmodule ProbuildExWeb.GameLive.RowComponent do
  use ProbuildExWeb, :live_component

  alias Phoenix.LiveView.JS
  alias ProbuildEx.App

  import ProbuildExWeb.GameLive.GridElementComponent
  import ProbuildExWeb.GameLive.DdragonComponent

  @defaults %{
    load_game?: false,
    game: nil,
    action: nil
  }

  def update(%{action: :query_game}, socket) do
    game_id = socket.assigns.participant.game.id

    socket =
      case App.fetch_game(game_id) do
        {:ok, game} ->
          assign(socket, action: nil, game: game, load_game?: false)

        {:error, :not_found} ->
          socket
      end

    {:ok, socket}
  end

  def update(assigns, socket) do
    socket =
      socket
      |> assign(@defaults)
      |> assign(assigns)

    {:ok, socket}
  end

  def handle_event("load-game", _params, socket) do
    socket =
      cond do
        is_struct(socket.assigns.game) ->
          socket

        is_nil(socket.assigns.game) ->
          send_update(__MODULE__, id: socket.assigns.id, action: :query_game)
          assign(socket, load_game?: true)
      end

    {:noreply, socket}
  end

  def render(assigns) do
    ~H"""
    <div
        class={[if(@participant.win, do: "border-blue-500", else: "border-red-500"), "hover:bg-gray-100  border-l-8 w-full max-w-3xl px-1 py-2 bg-white rounded-lg overflow-hidden shadow"]}>
      <div
        role="button"
        tabIndex="0"
        phx-click={JS.push("load-game") |> JS.toggle(to: "#participant-detail-#{@participant.id}")}
        phx-target={@myself}
        class={[if(@participant.win, do: "border-blue-500", else: "border-red-500"), "hover:bg-gray-100 hover:cursor-pointer w-full grid-participants "]}>
          <.time_ago participant_id={@participant.id} game_creation={@participant.game.creation} />
          <.pro_name pro_name={@participant.summoner.pro.name} />
          <.versus game_version={@participant.game.version}
                  champion_id={@participant.champion_id}
                  opponent_champion_id={@participant.opponent_participant.champion_id} />
          <.kda kills={@participant.kills} deaths={@participant.deaths} assists={@participant.assists} />
          <.summoners game_version={@participant.game.version} summoners={@participant.summoners} />
          <.items game_version={@participant.game.version} items={@participant.items} />
          <.ellipsis />
        </div>
        <%= cond do %>
          <% @load_game? -> %>
            <div class="w-full flex justify-center">
              <.spinner load?={@load_game?} />
            </div>
          <% is_struct(@game) -> %>
            <.game_detail participant={@participant} game={@game} />
          <% true -> %>
        <% end %>
    </div>
    """
  end

  defp game_detail(assigns) do
    ~H"""
    <div id={"participant-detail-#{@participant.id}"}>
      <div class="game-detail px-2 py-1 space-y-1">
        <%= for {p, player_index} <- Enum.with_index(@game.participants, 1) do %>
          <%= if player_index in [1, 6] do %>
            <div class="px-2 w-full grid-team-participants-header text-xs">
              <div>
                <%= if p.win do %>
                  <span class="text-blue-500 font-medium">Victory</span>
                <% else %>
                  <span class="text-red-500 font-medium">Defeat</span>
                <% end %>
                <%= if(player_index == 1, do: "Blue side") %>
                <%= if(player_index == 6, do: "Red side") %>
              </div>
              <div class="hidden md:flex justify-center">Summoners</div>
              <div class="hidden md:flex justify-center">KDA</div>
              <div class="hidden md:flex justify-center">Gold earned</div>
              <div class="hidden md:flex justify-center">Build</div>
            </div>
          <% end %>
          <div class={[if(p.id == @participant.id, do: "bg-gray-200"), "w-full grid-team-participants py-1 px-2 rounded-md"]}>
            <.summoner_champion
               game_version={@participant.game.version}
               champion_id={p.champion_id}
               summoner_name={p.summoner.name} />
            <.summoners game_version={@participant.game.version} summoners={p.summoners} />
            <.kda kills={p.kills} deaths={p.deaths} assists={p.assists} />
            <.gold_earned gold_earned={p.gold_earned} />
            <.items game_version={@participant.game.version} items={p.items} />
          </div>
        <% end %>
      </div>
    </div>
    """
  end
end
```
This time it's a smart compononent aka [live_component](https://hexdocs.pm/phoenix_live_view/Phoenix.LiveComponent.html)

The component should achieve the following:
- When we click on the row we should fetch the game details and display it
- While it's loading we should put our loading animation `<.spinner />`
- If the row is clicked again we should hide the game details
- If the row is clicked again we should display the game details without refetching the game details

In `GameLive.Index` we used `send()` with `handle_info()` to do a asynchronous loading while showing the `<.spinner/>`. For a `live_component` to achieve the same behavior we will use [`send_update`](https://hexdocs.pm/phoenix_live_view/Phoenix.LiveView.html#send_update/3) with a specific action and a pattern match on this action on the `update` function.

The flow for a click on `RowComponent` is the following, notice we are using [JS.push](https://hexdocs.pm/phoenix_live_view/Phoenix.LiveView.JS.html#push/1) and [JS.toggle](https://hexdocs.pm/phoenix_live_view/Phoenix.LiveView.JS.html#toggle/1)

{{< lightbox
  src="/posts/probuild-ex-part-five/2-flow-diagram.png"
  alt="probuild ex flow diagram"
>}}

The `render` function:
- We make usage of our `GridElementComponent`
- Notice the `phx-click` with the `phx-target` `@myself` that call `JS.push` and `JS.toggle` shown in the diagram.
- The `cond` to check if we should display the `<.spinner/>` or the `<.game_detail />`

The `game_detail` function:
- We iterate over our participants and we add an index with `Enum.with_index`
- Our participants are ordered per team and role so using the index we can split them in two blocks of five easily
- We make usage of our `GridElementComponent`


### GameLive view

Now we need to make our `GameLive` use our new `RowComponent`.

Edit `lib/probuild_ex_web/live/game_live/index.html.heex` at the top of the file add the `alias` and the `import`
```elixir
defmodule ProbuildExWeb.GameLive.Index do
  ...
  alias ProbuildExWeb.GameLive.RowComponent

  import ProbuildExWeb.GameLive.DdragonComponent
  ...
```

Edit `lib/probuild_ex_web/live/game_live/index.html.heex`
```elixir
<div class="flex flex-col">

  <.form let={f} for={@changeset} phx-change="filter" phx-submit="filter">
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
            <%= search_input(f, :search, phx_debounce: 300, class: "py-4 px-5 focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-full", placeholder: "Seach for a Champion or Pro Player") %>
          </div>
        </div>
      </div>
    </div>
    <div class="mt-3 flex flex-wrap justify-center">
      <span class="relative z-0 inline-flex shadow-sm rounded-md">
        <button phx-click="team_position" phx-value-position="" type="button" class="relative inline-flex items-center px-3 py-1 md:px-4 md:py-2 rounded-l-md border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">All Roles</button>
        <button phx-click="team_position" phx-value-position="TOP" type="button" class="-ml-px relative inline-flex items-center px-3 py-1 md:px-4 md:py-2 border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">Top</button>
        <button phx-click="team_position"  phx-value-position="JUNGLE" type="button" class="-ml-px relative inline-flex items-center px-3 py-1 md:px-4 md:py-2 border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">Jungle</button>
        <button phx-click="team_position" phx-value-position="MIDDLE" type="button" class="-ml-px relative inline-flex items-center px-3 py-1 md:px-4 md:py-2 border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">Middle</button>
        <button phx-click="team_position" phx-value-position="UTILITY" type="button" class="-ml-px relative inline-flex items-center px-3 py-1 md:px-4 md:py-2 border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">Utility</button>
        <button phx-click="team_position" phx-value-position="BOTTOM" type="button" class="-ml-px relative inline-flex items-center px-3 py-1 md:px-4 md:py-2 rounded-r-md border border-gray-300 bg-white text-xs md:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">Bottom</button>
      </span>
      <div>

        <%= select(f, :platform_id, App.Search.platform_options(), prompt: "All regions", class: "mt-1 md:mt-0 ml-2 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-xs md:text-sm rounded-md") %>
      </div>
    </div>
  </.form>

  <div class="mt-4 flex flex-col items-center space-y-1">
    <%= cond do %>
      <% @loading? -> %>
        <div class="w-full max-w-3xl py-2 flex justify-center">
          <.spinner load?={@loading?} />
        </div>

      <% length(@participants) == 0 -> %>
        <div class="w-full max-w-3xl py-2 flex justify-center">
          <div>No results...</div>
        </div>

      <% true -> %>
        <div class="w-full max-w-3xl grid-participants-header px-1 py-2 text-xs">
          <div></div>
          <div>Pro player</div>
          <div class="flex justify-center">Matchup</div>
          <div class="flex justify-center">KDA</div>
          <div class="flex justify-center">Summoners</div>
          <div class="flex justify-center">Build</div>
        </div>
        <div id="participants" phx-update={@update} class="w-full max-w-3xl flex-1 flex flex-col items-center space-y-1">
          <%= for participant <- @participants do %>
            <.live_component id={participant.id} module={RowComponent} participant={participant} />
          <% end %>
        </div>
    <% end %>
    <div id="infinite-scroll" phx-hook="InfiniteScroll" data-page={@page.page_number} class="w-full max-w-3xl py-2 flex justify-center">
      <.spinner load?={@load_more?} />
    </div>
  </div>

</div>
```

In the view we replaced the spinner images with our `<.spinner/>` components and we call our `RowComponent` in the participants loop.

Visit [http://localhost:4000](http://localhost:4000) we should see

{{< lightbox
  src="/posts/probuild-ex-part-five/3-game-details.png"
  alt="probuild ex game details screenshot"
>}}


## Add game in realtime - [commit](https://github.com/mrdotb/probuild_ex/commit/e4b01b620d858232729d2cb40444768a40fcbf8d)

Now we want to add game in realtime to our dashboard, Phoenix come with [PubSub](https://hexdocs.pm/phoenix_pubsub/Phoenix.PubSub.html).

### Config PubSub

Edit `config/config.exs` replace the `:pubsub_server` key with the atom `:pbx_pubsub`
```elixir
config :probuild_ex, ProbuildExWeb.Endpoint,
  url: [host: "localhost"],
  render_errors: [view: ProbuildExWeb.ErrorView, accepts: ~w(html json), layout: false],
  pubsub_server: :pbx_pubsub,
  live_view: [signing_salt: "0VmmhuEM"]
```
I prefer to use an atom over a module that does not exist.

Edit `lib/probuild_ex/application.ex` replace the `:name` key
```elixir
      # Start the PubSub system
      {Phoenix.PubSub, name: :pbx_pubsub},
```

### Broadcast new pro participant

We will add some code to broadcast a game when the multi that create game is successfull.

Edit `lib/probuild_ex/games.ex`
```elixir
defmodule ProbuildEx.Games do
...
  alias Phoenix.PubSub
...
  def create_game_complete(platform_id, match_data, summoners_list) do
    multi = Multi.insert(Multi.new(), :game, change_game(match_data))
    multi =
      Enum.reduce(summoners_list, multi, fn summoner, multi ->
        reduce_put_or_create_summoner(platform_id, summoner, multi)
      end)
    participants = get_in(match_data, ["info", "participants"])
    multi = Enum.reduce(participants, multi, &reduce_create_participant/2)
    multi = Enum.reduce(participants, multi, &reduce_set_opponent_participant/2)

    multi
    |> Repo.transaction()
    |> maybe_broadcast_game()
  end
...
  defp maybe_broadcast_game(multi_result)

  defp maybe_broadcast_game({:ok, multi}) do
    for {{:summoner, pro_puuid}, %{pro_id: pro_id}} when is_integer(pro_id) <- multi do
      participant = Map.get(multi, {:update_participant, pro_puuid})
      PubSub.broadcast(:pbx_pubsub, "pro_participant:new", {:participant_id, participant.id})
    end

    {:ok, multi}
  end

  defp maybe_broadcast_game(multi_result), do: multi_result
end
```

We check the result of the multi and if it's a successfull we broadcast on the topic `pro_participant:new` a message with the new `participant_id` of pro players. 

It's possible that a game have many pro players and in this case we should broadcast one message per pro_player.


Here is a diagram flow
{{< lightbox
  src="/posts/probuild-ex-part-five/4-flow-broadcast.png"
  alt="probuild ex game details screenshot"
>}}


### Add a fetch_pro_participant in app context

Because we broadcast `participant_id` we need a function to retrieve the participant detail in the database.
Edit `lib/probuild_ex/games.ex`
```elixir
defmodule ProbuildEx.Games do
...
  def fetch_pro_participant(search_opts) do
    query = Enum.reduce(search_opts, pro_participant_base_query(), &reduce_pro_participant_opts/2)

    case Repo.one(query) do
      nil -> {:error, :not_found}
      participant -> {:ok, participant}
    end
  end

  ...

  defp reduce_pro_participant_opts({:participant_id, participant_id}, query) do
    from participant in query,
      where: participant.id == ^participant_id
  end

  ...
end
```
We use the same `pro_participant_base_query()` as in the `list_*` we also add a reduce clause to be able to filter per `participant_id`

### Subscribe to the topic in the GameLive

We want to add a button to subscribe / unsubscribe to the topic.

Edit `lib/probuild_ex_web/live/game_live/index.ex`
```elixir
defmodule ProbuildExWeb.GameLive.Index do
...
  alias Phoenix.PubSub
...

  @defaults %{
    page_title: "Listing games",
    update: "append",
    changeset: App.Search.changeset(),
    search: %App.Search{},
    page: %Scrivener.Page{},
    participants: [],
    loading?: true,
    load_more?: false,
    subscribed?: false
  }

...

  def handle_event("subscribe", _params, socket) do
    subscribed? =
      if socket.assigns.subscribed? do
        unsubscribe()
      else
        subscribe()
      end

    socket = assign(socket, :subscribed?, subscribed?)

    {:noreply, socket}
  end

...

  def handle_info({:participant_id, participant_id}, socket) do
    opts =
      socket.assigns.search
      |> App.Search.to_map()
      |> Map.put(:participant_id, participant_id)

    socket =
      case App.fetch_pro_participant(opts) do
        {:ok, participant} ->
          assign(socket, update: "prepend", participants: [participant])

        {:error, _} ->
          socket
      end

    {:noreply, socket}
  end

...

  defp subscribe do
    case PubSub.subscribe(:pbx_pubsub, "pro_participant:new") do
      :ok -> true
      {:error, _} -> false
    end
  end

  defp unsubscribe do
    PubSub.unsubscribe(:pbx_pubsub, "pro_participant:new")
    false
  end
end
```

Edit `lib/probuild_ex_web/live/game_live/index.html.heex`
```elixir
    <div class="mt-3 flex flex-wrap justify-center">

      <button phx-click="subscribe" type="button" class="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
        <div class="flex items-center">
          <span class="font-medium">
            Live <%= if(@subscribed?, do: "on", else: "off") %>
          </span>
          <span class="ml-1 flex h-3 w-3 relative">
            <span class={[if(@subscribed?, do: "bg-sky-400", else: "bg-red-500"), "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"]}></span>
            <span class={[if(@subscribed?, do: "bg-sky-400", else: "bg-red-500"), "relative inline-flex rounded-full h-3 w-3"]}></span>
          </span>
        </div>
      </button>

      <span class="ml-2 relative z-0 inline-flex shadow-sm rounded-md">
```

We added:
- a boolean `subscribed?` to the `@default` assigns.
- a `handle_event` for the subscribe / unsubscribe and set the boolean in assign
- a `handle_info` that will receive the broadcasted message with the participant_id and fetch it  using the current search options (if it does not match the current search it will no be prepend)

I subscribed to the topic by clicking on the button then I filter by TOP position it also filter the real time game.

{{< youtube 00IscrUHo2o >}}

Perfomance wise it's not the best, it does to much db query but I want to keep it simple.

## Deploy on fly.io - [commit](https://github.com/mrdotb/probuild_ex/commit/43ba6aeb81f19b8e7d686a9e8d410747b2ff3812)

You need to register on [fly.io](https://fly.io/).

Open a shell at the root of `probuild_ex`
```bash
# Install fly.io
$ curl -L https://fly.io/install.sh | sh

# Login
$ flyctl auth login

# Setup the app and db
$ fly launch
Detected a Phoenix app
? App Name (leave blank to use an auto-generated name):
? Select organization: mrdotb (personal)
? Select region: cdg (Paris, France)
Created app billowing-resonance-7078 in organization personal
Set secrets on billowing-resonance-7078: SECRET_KEY_BASE
Preparing system for Elixir builds
Installing application dependencies
Running Docker release generator
Wrote config file fly.toml
# Answer yes
? Would you like to set up a Postgresql database now? Yes
For pricing information visit: https://fly.io/docs/about/pricing/#postgresql-clusters
? Select configuration: Development - Single node, 1x shared CPU, 256MB RAM, 1GB disk
Creating postgres cluster billowing-resonance-7078-db in organization personal
Postgres cluster billowing-resonance-7078-db created
  Username:    postgres
  Password:    09c62867ee8e810ee0342d4294f25869220ee11310626101
  Hostname:    billowing-resonance-7078-db.internal
  Proxy Port:  5432
  PG Port: 5433
Save your credentials in a secure place -- you won t be able to see them again!

Monitoring Deployment

1 desired, 1 placed, 1 healthy, 0 unhealthy [health checks: 3 total, 3 passing]
--> v0 deployed successfully

# Wait a bit

Connect to postgres
Any app within the personal organization can connect to postgres using the above credentials and the hostname "billowing-resonance-7078-db.internal."
For example: postgres://postgres:09c62867ee8e810ee0342d4294f25869220ee11310626101@billowing-resonance-7078-db.internal:5432

Now that you ve set up postgres, here s what you need to understand: https://fly.io/docs/reference/postgres-whats-next/

Postgres cluster billowing-resonance-7078-db is now attached to billowing-resonance-7078
The following secret was added to billowing-resonance-7078:
  DATABASE_URL=postgres://billowing_resonance_7078:rtLepbpsreALuRO@top2.nearest.of.billowing-resonance-7078-db.internal:5432/billowing_resonance_7078
Postgres cluster billowing-resonance-7078-db is now attached to billowing-resonance-7078
# Answer no
? Would you like to deploy now? No

Your Phoenix app should be ready for deployment!.

If you need something else, post on our community forum at https://community.fly.io.

When you re ready to deploy, use 'fly deploy'.
```

We need to add our riot token to the generated `runtime.exs`
On `config/runtime.exs` add
```elixir
if config_env() == :prod do
  ...
  config :probuild_ex, ProbuildEx.RiotApi, token: System.get_env("RIOT_TOKEN")
end
```

Open the shell again
```shell
# We add our RIOT_TOKEN to the secrets don't forget to refresh it if it's a development key https://developer.riotgames.com/
$ fly secrets set RIOT_TOKEN=RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx   
Secrets are staged for the first deployment

# Deploy
$ fly deploy

# After deployment is done
$ fly open
```

It should open the url and start collecting data

## Closing thoughts

Well done and thanks for sticking with me to the end! We covered quite a lot of ground and hopefully you picked up a couple of cool tips and tricks along the way. I encourage you to continue there still a lot that we can do with all those data. Examples:
- A new liveview to display the most picked champions of pro player per patch / role/ region
- A new liveview to display the best / worst champions winrate
- Add new source to add pro player / streamers
- Your ideas ...

I will try to keep the project running on https://probuild.fly.dev.
If you want to show me what you did fork the [repo](https://github.com/mrdotb/probuild_ex) and open an issue.

Be sure to sign up to the newsletter so that you won't miss my next article. Feel free to leave comments or feedback especially if you did the whole series. I also appreciate if you can star ⭐ the companion code [repo](https://github.com/mrdotb/probuild_ex).

Until Next Time !
{{< newsletter >}}
