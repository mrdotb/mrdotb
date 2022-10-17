+++
title = 'Probuild Ex Part four'
date = '2022-10-15T16:44:01+02:00'
author = 'mrdotb'
description = 'A league of legend probuilds with elixir phoenix, part four'
tags = ['elixir', 'phoenix', 'liveview', 'tutorial', 'ecto', 'infinite scroll']
toc = true
showReadingTime = true
cover = "/posts/probuild-ex-part-four/cover.png"
+++

## Intro

In [Part three](/posts/probuild-ex-part-three/) we setup our base liveview and `App` context.
In this fourth part, we are going to create:
- A [changeset](https://hexdocs.pm/ecto/Ecto.Changeset.html) `Search` in our context `App` to modelize the liveview search parameters
- A query with [ecto composition](https://elixirschool.com/blog/ecto-query-composition) method to search in our `Participants`
- An infinite scroll with [liveview hook](https://hexdocs.pm/phoenix_live_view/js-interop.html#client-hooks-via-phx-hook) and [scrivener_ecto](https://github.com/drewolson/scrivener_ecto)

Part four assumes that you have already gone through [Part three](/posts/probuild-ex-part-three/) and have the code at a point where we can jump right in. If you want to checkout the companion code and fast forward to this point, do the following:

```shell
git clone https://github.com/mrdotb/probuild_ex.git
cd probuild_ex
git checkout 0633b54a6465bf73273074267ea57cb75c0b3dca
```

{{< newsletter >}}


## App context search - [commit](https://github.com/mrdotb/probuild_ex/commit/7cca40ad6906eec08daf09ab0fdc631e78bdc8fc)

Edit `lib/probuild_ex/app.ex`
```elixir
defmodule ProbuildEx.App do
  @moduledoc """
  The context module who hold the queries.
  """

  import Ecto.Query

  alias ProbuildEx.Repo

  alias ProbuildEx.Games.Participant

  defmodule Search do
    @moduledoc """
    We represent our search input in a embedded_schema to use ecto validation
    helpers.
    """

    use Ecto.Schema
    import Ecto.Changeset

    @primary_key false

    embedded_schema do
      field :search, :string
      field :platform_id, Ecto.Enum, values: [:euw1, :jp1, :kr, :na1, :br1]
      field :team_position, Ecto.Enum, values: [:UTILITY, :TOP, :JUNGLE, :MIDDLE, :BOTTOM]
    end

    def changeset(search \\ %__MODULE__{}, attrs \\ %{}) do
      cast(search, attrs, [:search, :platform_id, :team_position])
    end

    def validate(changeset) do
      apply_action(changeset, :insert)
    end

    def to_map(search) do
      Map.from_struct(search)
    end

    def platform_options do
      Ecto.Enum.values(__MODULE__, :platform_id)
    end
  end

  defp pro_participant_base_query do
    from participant in Participant,
      left_join: game in assoc(participant, :game),
      as: :game,
      left_join: summoner in assoc(participant, :summoner),
      left_join: opponent_participant in assoc(participant, :opponent_participant),
      inner_join: pro in assoc(summoner, :pro),
      as: :pro,
      preload: [
        game: game,
        opponent_participant: opponent_participant,
        summoner: {summoner, pro: pro}
      ],
      order_by: [desc: game.creation],
      limit: 20
  end

  def list_pro_participant_summoner(search_opts) do
    query = Enum.reduce(search_opts, pro_participant_base_query(), &reduce_pro_participant_opts/2)

    Repo.all(query)
  end

  defp reduce_pro_participant_opts({:platform_id, nil}, query) do
    query
  end

  defp reduce_pro_participant_opts({:platform_id, platform_id}, query) do
    from [participant, game: game] in query,
      where: game.platform_id == ^platform_id
  end

  defp reduce_pro_participant_opts({:team_position, nil}, query) do
    query
  end

  defp reduce_pro_participant_opts({:team_position, team_position}, query) do
    from [participant] in query,
      where: participant.team_position == ^team_position
  end

  defp reduce_pro_participant_opts({:search, nil}, query) do
    query
  end

  defp reduce_pro_participant_opts({:search, search}, query) do
    search_str = search <> "%"

    from [participant, pro: pro] in query,
      where: ilike(pro.name, ^search_str)
  end

  defp reduce_pro_participant_opts({key, value}, _query),
    do: raise("not supported option #{inspect(key)} with value #{inspect(value)}")
end
```
We did two things:
- We created a submodule `Search` using `embedded_schema` and `changeset` to represent what are the valid search parameters `search`, `platform_id` and `team_position`
- We added some [ecto query composition](https://elixirschool.com/blog/ecto-query-composition) method to our `list_pro_participant_summoner` query

Now let's ensure it works by adding some tests.

Edit `test/support/fixtures/game_data_fixtures.ex`
```elixir
defmodule ProbuildEx.GameDataFixtures do
...
  @weiwei_ugg %{
    "current_ign" => "2639439711897152",
    "current_team" => "Bilibili Gaming",
    "league" => "LPL",
    "main_role" => "jungle",
    "normalized_name" => "weiwei",
    "official_name" => "Weiwei",
    "region_id" => "kr"
  }

  @weiwei_summoner_riot %{
    "accountId" => "_-m7Gyn4QupEILCjIt7KAMXBv5AhpPOzkWf9LuIehDILnvGy01qYgAKc",
    "id" => "NEXg9wj80c8ygbKTds2qVxdpMVIytZRpWuxLjPxJB3rJKx702B-BW0ZsMQ",
    "name" => "2639439711897152",
    "profileIconId" => 5212,
    "puuid" => "Kr4y3g-A2i3ygwfAfPAVhrNdwxP8S8EvzM4-Uzcpzf-hOLlaLWnVsjRjX_vsxGDo53k22fczemzjdQ",
    "revisionDate" => 1_642_137_289_000,
    "summonerLevel" => 177
  }

  def get_weiwei do
    %{
      ugg: @weiwei_ugg,
      summoner_riot: @weiwei_summoner_riot
    }
  end
...
end
```

We add a pro player data to `GameDataFixtures`

Edit `test/probuild_ex/app_test.exs`
```elixir
defmodule ProbuildEx.AppTest do
  use ExUnit.Case, async: true
  use ProbuildEx.DataCase

  import ProbuildEx.GamesFixtures

  alias ProbuildEx.{App, Games}
  alias ProbuildEx.GameDataFixtures

  describe "search" do
    test "validate/1 should validate query" do
      query = %{"search" => "faker", "platform_id" => "euw1", "team_position" => "MIDDLE"}
      changeset = App.Search.changeset(%App.Search{}, query)
      assert {:ok, _search} = App.Search.validate(changeset)
    end

    test "validate/1 should ignore extra params" do
      query = %{"bob" => "bob"}
      changeset = App.Search.changeset(%App.Search{}, query)
      assert {:ok, _search} = App.Search.validate(changeset)
    end

    test "validate/1 should error when value not in enum" do
      query = %{"search" => "faker", "platform_id" => "bob", "team_position" => "MIDDLE"}
      changeset = App.Search.changeset(%App.Search{}, query)
      assert {:error, _changeset} = App.Search.validate(changeset)
    end
  end

  describe "list" do
    defp create_weiwei_game do
      data = GameDataFixtures.get()
      weiwei_data = GameDataFixtures.get_weiwei()
      # create weiwei
      {:ok, result} = Games.create_pro_complete(weiwei_data.ugg, weiwei_data.summoner_riot)
      # put weiwei summoner in summoners_list
      summoners_list =
        Enum.map(data.summoners_list, fn summoner ->
          if(summoner["id"] == weiwei_data.summoner_riot["id"],
            do: result.summoner,
            else: summoner
          )
        end)

      Games.create_game_complete(
        data.platform_id,
        data.game_data,
        summoners_list
      )
    end

    test "list_pro_participant_summoner/1 should return participant matching the query" do
      # This game off weiwei is on :kr and his position is :TOP
      create_weiwei_game()

      [_] = App.list_pro_participant_summoner(%{search: "weiwei"})
      [_] = App.list_pro_participant_summoner(%{platform_id: :kr})
      [_] = App.list_pro_participant_summoner(%{team_position: :TOP})

      [] = App.list_pro_participant_summoner(%{search: "faker"})
      [] = App.list_pro_participant_summoner(%{platform_id: :euw1})
      [] = App.list_pro_participant_summoner(%{team_position: :MIDDLE})
    end
  end
end
```
We test our `Search.validate/1` function and `list_pro_participant_summoner/1` using real data from `weiwei` player. We ensure that we got one result when we look for the weiwei game.

## Liveview search - [commit](https://github.com/mrdotb/probuild_ex/commit/372831a0503b656ab52460b1aac1e75822cc4a7c)

Now it's time to integrate the search to our liveview.

Edit `lib/probuild_ex_web/live/game_live/index.ex`
```elixir
defmodule ProbuildExWeb.GameLive.Index do
  use ProbuildExWeb, :live_view

  alias ProbuildEx.App
  alias ProbuildEx.Ddragon

  @defaults %{
    page_title: "Listing games",
    changeset: App.Search.changeset(),
    search: %App.Search{},
    participants: [],
    loading?: true
  }

  @impl true
  def mount(_params, _session, socket) do
    {:ok, assign(socket, @defaults)}
  end

  @impl true
  def handle_params(params, _url, socket) do
    # Avoid double request learn more on the article below
    # https://kobrakai.de/kolumne/liveview-double-mount/
    socket =
      if connected?(socket) do
        apply_action(socket, socket.assigns.live_action, params)
      else
        socket
      end

    {:noreply, socket}
  end

  defp apply_action(socket, :index, params) do
    changeset = App.Search.changeset(socket.assigns.search, params)

    case App.Search.validate(changeset) do
      {:ok, search} ->
        opts = App.Search.to_map(search)
        # Don't block the apply_action, execute the slow request in handle_info
        send(self(), {:query_pro_participants, opts})

        assign(
          socket,
          changeset: changeset,
          search: search,
          loading?: true
        )

      {:error, _changest} ->
        socket
    end
  end

  @impl true
  def handle_event(
        "filter",
        %{"search" => %{"platform_id" => platform_id, "search" => search}},
        socket
      ) do
    changeset =
      App.Search.changeset(socket.assigns.search, %{
        "platform_id" => platform_id,
        "search" => search
      })

    socket =
      case App.Search.validate(changeset) do
        {:ok, search} ->
          socket
          |> assign(changeset: changeset, search: search)
          |> push_patch_index()

        {:error, _changest} ->
          socket
      end

    {:noreply, socket}
  end

  def handle_event("team_position", %{"position" => position}, socket) do
    changeset = App.Search.changeset(socket.assigns.search, %{"team_position" => position})

    socket =
      case App.Search.validate(changeset) do
        {:ok, search} ->
          socket
          |> assign(changeset: changeset, search: search)
          |> push_patch_index()

        {:error, _changest} ->
          socket
      end

    {:noreply, socket}
  end

  @impl true
  def handle_info({:query_pro_participants, opts}, socket) do
    participants = App.list_pro_participant_summoner(opts)

    socket =
      assign(
        socket,
        participants: participants,
        loading?: false
      )

    {:noreply, socket}
  end

  defp push_patch_index(socket) do
    params = App.Search.to_map(socket.assigns.search)
    push_patch(socket, to: Routes.game_index_path(socket, :index, params))
  end
end
```


Edit `lib/probuild_ex_web/live/game_live/index.html.heex`
```html
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
          <img src="https://developer.riotgames.com/static/img/katarina.55a01cf0560a.gif" />
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
        <%= for participant <- @participants do %>
          <div id={"participant-#{participant.id}"} class={[if(participant.win, do: "border-blue-500", else: "border-red-500"), "hover:bg-gray-100 hover:cursor-pointer border-l-8 w-full max-w-3xl grid-participants px-1 py-2 bg-white rounded-lg overflow-hidden shadow"]}>
            <div class="grid-area-creation flex md:justify-center items-center">
              <time id={"time-ago-#{participant.id}"} phx-hook="TimeAgo" datetime={participant.game.creation}></time>
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
              <%= img_tag(Ddragon.get_champion_image(participant.game.version, participant.champion_id), class: "w-8 h-8 rounded-full") %>
              <span>vs</span>
              <%= img_tag(Ddragon.get_champion_image(participant.game.version, participant.opponent_participant.champion_id), class: "w-8 h-8 rounded-full") %>
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
              <%= for summoner_key <- participant.summoners do %>
                <%= img_tag(Ddragon.get_summoner_image(participant.game.version, summoner_key), class: "w-8 h-8 border border-gray-400") %>
              <% end %>
            </div>

            <div class="grid-area-build flex justify-center items-center space-x-1">
              <%= for item_key <- participant.items do %>
                <%= if src = Ddragon.get_item_image(participant.game.version, item_key) do %>
                  <img src={src} class="w-8 h-8" />
                <% else %>
                  <div class="bg-gray-900 w-8 h-8 border border-gray-400"></div>
                <% end %>
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
    <% end %>
  </div>

</div>
```
Many changes in our `GameLive` liveview let's break it up:
- I like to set a `@defaults` at the top of my liveview like this I am able to see the shape of the state easily
- The `mount` assign the `@defaults`
- The `handle_params` call `apply_action/3` but only if the liveview is `connected?` to avoid [double mount](https://kobrakai.de/kolumne/liveview-double-mount/)
- On `apply_action` we validate the search, if it's valid we send a message to ourself to `query_pro_participants` in an asynchronous fashion while showing a loading animation.
- On `handle_event` we get the form action or the clicks on the team position then we call a `push_patch_index` that will call `handle_params` then `apply_action`
- We used [Form bindings](https://hexdocs.pm/phoenix_live_view/form-bindings.html) to use our search changeset
- We binded our buttons click to their team position
- The rows render use a `cond` to check in order if we are `loading?`, if there is no results or display the results


Visit [http://localhost:4000](http://localhost:4000) and try the search and filters

{{< lightbox
  src="/posts/probuild-ex-part-four/1-search-and-filter.png"
  alt="Search and filter implemented"
>}}

## Search by champion name - [commit](https://github.com/mrdotb/probuild_ex/commit/f2961574f7a288a1f7119dc497b26ca2138690ba)

Because we store `champion_id` and we want to search `champion` name  we need to create a champions_search_map.
We will add a function to our `Ddragon.Cache` module.

Edit `lib/probuild_ex/ddragon/cache.ex`
```elixir
defmodule ProbuildEx.Ddragon.Cache do
...
  def fetch_champions_search_map do
    GenServer.call(__MODULE__, :fetch_champions_search_map)
  end
...
  defp request_and_cache_champions do
    with {:ok, %{body: versions}} <- Api.fetch_versions(),
         last_game_version <- List.first(versions),
         {:ok, %{body: champions_response}} <- Api.fetch_champions(last_game_version) do
      champions_search_map = create_champions_search_map(champions_response)
      champions_img_map = create_champions_img_map(champions_response)

      :ets.insert(:champions, {:search_map, champions_search_map})

      Enum.each(champions_img_map, fn {key, img} ->
        :ets.insert(:champions, {{:img, key}, img})
      end)
    end
  end
...
  def handle_call(:fetch_champions_search_map, _from, state) do
    response =
      case :ets.lookup(:champions, :search_map) do
        [{_, champions_map}] ->
          {:ok, champions_map}

        [] ->
          {:error, :not_found}
      end

    {:reply, response, state}
  end
...
  defp create_champions_search_map(champions_response) do
    champions_response
    |> Map.get("data")
    |> Enum.map(fn {_champion_id, data} ->
      key = String.downcase(data["name"])
      value = String.to_integer(data["key"])
      {key, value}
    end)
    |> Map.new()
  end
end
```

Edit `lib/probuild_ex/ddragon.ex`
```elixir
defmodule ProbuildEx.Ddragon do
...
  @doc """
  Get a champion search map
  ## Example
    iex> Ddragon.get_champions_search_map()
    %{
      "lux" => 99,
      "evelynn" => 28,
      "heimerdinger" => 74,
      ...
    }
  """
  def get_champions_search_map do
    case Cache.fetch_champions_search_map() do
      {:ok, search_map} ->
        search_map

      {:error, _} ->
        %{}
    end
  end
end
```

We got the function to get our champions search map from Ddragon. Now we wil add it to our search close in the query.

Edit `lib/probuild_ex/app.ex`
```elixir
defmodule ProbuildEx.App do
...
  alias ProbuildEx.Ddragon
...
  defp reduce_pro_participant_opts({:search, search}, query) do
    champions_ids =
      Enum.reduce(Ddragon.get_champions_search_map(), [], fn {champion_name, champion_id}, acc ->
        if String.starts_with?(champion_name, search) do
          [champion_id | acc]
        else
          acc
        end
      end)

    search_str = search <> "%"

    from [participant, pro: pro] in query,
      where: ilike(pro.name, ^search_str) or participant.champion_id in ^champions_ids
  end
...
end
```

We added some logic in our search close. We use `String.start_with?/2` to reduce our champion search map. If it match the champion name we add the `champion_id` to the list and use it to filter.

## Hook infinite scroll

### Install scrivener for easy pagination - [commit](https://github.com/mrdotb/probuild_ex/commit/e50a7ddbffad695097a7e477d0f1632d386772fb)

We will use [scrivener_ecto](https://github.com/drewolson/scrivener_ecto) to handle the pagination.

Edit `mix.exs`
```elixir
defmodule ProbuildEx.MixProject do
...
  def application do
    [
      mod: {ProbuildEx.Application, []},
      extra_applications: [:logger, :runtime_tools, :scrivener]
    ]
  end
...
  defp deps do
    [
      ...
      {:scrivener_ecto, "~> 2.7"},
    ]
  end
...
end
```

Edit `lib/probuild_ex/repo.ex`
```elixir
defmodule ProbuildEx.Repo do
  use Ecto.Repo,
    otp_app: :probuild_ex,
    adapter: Ecto.Adapters.Postgres

  use Scrivener, page_size: 20
end
```

Nothing special we follow the scrivener installation guideline.

### Paginate query and liveview infiniteScroll [commit](https://github.com/mrdotb/probuild_ex/commit/eb78ead3d201c1c74478001e728de3198c8b5a7b)

Edit `lib/probuild_ex/app.ex`
```elixir
defmodule ProbuildEx.App do
...
  defp pro_participant_base_query do
    from participant in Participant,
      left_join: game in assoc(participant, :game),
      as: :game,
      left_join: summoner in assoc(participant, :summoner),
      left_join: opponent_participant in assoc(participant, :opponent_participant),
      inner_join: pro in assoc(summoner, :pro),
      as: :pro,
      preload: [
        game: game,
        opponent_participant: opponent_participant,
        summoner: {summoner, pro: pro}
      ],
      order_by: [desc: game.creation]
  end

  @doc """
  Query pro participant paginated based on search_opts.
  """
  def paginate_pro_participants(search_opts, page_number \\ 1) do
    query = Enum.reduce(search_opts, pro_participant_base_query(), &reduce_pro_participant_opts/2)

    Repo.paginate(query, page: page_number)
  end
...
end
```
We need to remove the limit from the `base_query()` we rename the function `list_*` to `paginate_*` and add an extra parameter `page_number`.

Edit `test/probuild_ex/app_test.exs`
```elixir
defmodule ProbuildEx.AppTest do
  ...
  describe "list" do
    ...
    test "paginate_pro_participants/1 should return participant matching the query" do
      # This game off weiwei is on :kr and his position is :TOP and play yone
      create_weiwei_game()

      %{total_entries: 1} = App.paginate_pro_participants(%{search: "weiwei"})
      %{total_entries: 1} = App.paginate_pro_participants(%{search: "yone"})
      %{total_entries: 1} = App.paginate_pro_participants(%{platform_id: :kr})
      %{total_entries: 1} = App.paginate_pro_participants(%{team_position: :TOP})

      %{total_entries: 0} = App.paginate_pro_participants(%{search: "faker"})
      %{total_entries: 0} = App.paginate_pro_participants(%{platform_id: :euw1})
      %{total_entries: 0} = App.paginate_pro_participants(%{team_position: :MIDDLE})
    end
  end
end
```
We edited the tests because now it returns a `%Scrivener.Page{}` instead of a list of `Participants`

Edit `assets/js/app.js`
```javascript
// https://elixirforum.com/t/how-can-i-implement-an-infinite-scroll-in-liveview/30457
// https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver
Hooks.InfiniteScroll = {
  page() {
    return parseInt(this.el.dataset.page, 10);
  },
  loadMore(entries) {
    const target = entries[0];
    if (this.pending && target.isIntersecting && this.pending == this.page()) {
      this.pending = this.page() + 1;
      this.pushEvent("load-more", {});
    }
  },
  mounted() {
    this.pending = this.page();
    const options = {
      root: null,
      rootMargin: "-90% 0px 10% 0px",
      threshold: 1.0
    };
    this.observer = new IntersectionObserver(this.loadMore.bind(this), options)
    this.observer.observe(this.el);
  },
  reconnected() {
    this.pending = this.page()
  },
  updated() {
    this.pending = this.page();
  },
  beforeDestroy() {
    this.observer.unobserve(this.el);
  },
};
```

We used the [`IntersectionObserver`](https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver) to trigger the load of more data. I use a modified `rootMargin` to put the root on the bottom of the page. Below a schema representing the boxes model.
The `loadMore` function will trigger when the `#load-more` div and the root overlap.

{{< lightbox
  src="/posts/probuild-ex-part-four/3-intersection-observer.png"
  alt="intersection observer image"
>}}

Edit `lib/probuild_ex_web/live/game_live/index.html.heex`
```elixir
defmodule ProbuildExWeb.GameLive.Index do
  use ProbuildExWeb, :live_view

  alias ProbuildEx.App
  alias ProbuildEx.Ddragon

  @defaults %{
    page_title: "Listing games",
    update: "append",
    changeset: App.Search.changeset(),
    search: %App.Search{},
    page: %Scrivener.Page{},
    participants: [],
    loading?: true,
    load_more?: false
  }

  def mount(_params, _session, socket) do
    {:ok, assign(socket, @defaults), temporary_assigns: [participants: []]}
  end

  ...

  def handle_event("load-more", _params, socket) do
    page = socket.assigns.page

    socket =
      if page.page_number < page.total_pages do
        opts = App.Search.to_map(socket.assigns.search)
        # Don't block the load-more event, execute the slow request in handle_info
        send(self(), {:query_pro_participants, opts, page.page_number + 1})
        assign(socket, load_more?: true)
      else
        socket
      end

    {:noreply, socket}
  end

  @impl true
  def handle_info({:query_pro_participants, opts}, socket) do
    page = App.paginate_pro_participants(opts)

    socket =
      assign(
        socket,
        update: "replace",
        page: page,
        participants: page.entries,
        loading?: false
      )

    {:noreply, socket}
  end

  def handle_info({:query_pro_participants, opts, page_number}, socket) do
    page = App.paginate_pro_participants(opts, page_number)

    socket =
      assign(
        socket,
        update: "append",
        page: page,
        participants: page.entries,
        load_more?: false
      )

    {:noreply, socket}
  end

  ...
end
```

Edit `lib/probuild_ex_web/live/game_live/index.html.heex`
```html
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
          <img src="https://developer.riotgames.com/static/img/katarina.55a01cf0560a.gif" />
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
            <div id={"participant-#{participant.id}"} class={[if(participant.win, do: "border-blue-500", else: "border-red-500"), "hover:bg-gray-100 hover:cursor-pointer border-l-8 w-full max-w-3xl grid-participants px-1 py-2 bg-white rounded-lg overflow-hidden shadow"]}>
              <div class="grid-area-creation flex md:justify-center items-center">
                <time id={"time-ago-#{participant.id}"} phx-hook="TimeAgo" datetime={participant.game.creation}></time>
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
                <%= img_tag(Ddragon.get_champion_image(participant.game.version, participant.champion_id), class: "w-8 h-8 rounded-full") %>
                <span>vs</span>
                <%= img_tag(Ddragon.get_champion_image(participant.game.version, participant.opponent_participant.champion_id), class: "w-8 h-8 rounded-full") %>
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
                <%= for summoner_key <- participant.summoners do %>
                  <%= img_tag(Ddragon.get_summoner_image(participant.game.version, summoner_key), class: "w-8 h-8 border border-gray-400") %>
                <% end %>
              </div>

              <div class="grid-area-build flex justify-center items-center space-x-1">
                <%= for item_key <- participant.items do %>
                  <%= if src = Ddragon.get_item_image(participant.game.version, item_key) do %>
                    <img src={src} class="w-8 h-8" />
                  <% else %>
                    <div class="bg-gray-900 w-8 h-8 border border-gray-400"></div>
                  <% end %>
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
    <% end %>
    <div id="infinite-scroll" phx-hook="InfiniteScroll" data-page={@page.page_number} class="w-full max-w-3xl py-2 flex justify-center">
      <img class={if not @load_more?, do: "invisible"} src="https://developer.riotgames.com/static/img/katarina.55a01cf0560a.gif" />
    </div>
  </div>

</div>
```
Changes:
- We use a dynamic [`phx-update`](https://hexdocs.pm/phoenix_live_view/dom-patching.html#temporary-assigns) since we need to append extra data when the infinite scroll trigger or replace all the data when a new search query is typed.
- We use [temporary assigns](https://hexdocs.pm/phoenix_live_view/dom-patching.html#temporary-assigns) for our participants in the mount since we will render a large collection of data it's better to not keep it in memory.
- We handle the event `load-more` it will asynchronous call `query_pro_participants` while we put a loading animation
- On the view we added `phx-update` and the `InfiniteScroll` hook


Visit [http://localhost:4000](http://localhost:4000) and scroll to trigger a load more

{{< lightbox
  src="/posts/probuild-ex-part-four/2-load-more.png"
  alt="infinite scroll"
>}}

## Closing thoughts

Well done and thanks for sticking with me to the end! We did the first part of our liveview application.

In the next part which is the final one we will:
- refactor our current views in live components
- query a game for all the details and add it to our view on click
- add game in realtime using [PubSub](https://hexdocs.pm/phoenix_pubsub/Phoenix.PubSub.html)
- deploy on [fly.io](https://fly.io/)

Be sure to sign up to the newsletter so that you won't miss the next Part. Feel free to leave comments or feedback. I also appreciate if you can star ⭐ the companion code [repo](https://github.com/mrdotb/probuild_ex).

See you soon !
{{< newsletter >}}
