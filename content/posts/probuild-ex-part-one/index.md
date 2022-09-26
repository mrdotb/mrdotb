+++
title = 'Probuild Ex Part One'
date = '2022-09-13T16:44:01+02:00'
author = 'mrdotb'
description = 'A league of legend probuilds with elixir phoenix, part one.'
tags = ['elixir', 'phoenix', 'ecto', 'tutorial', 'riot api']
toc = true
showReadingTime = true
cover = "/posts/probuild-ex-part-one/cover.png"
+++

## Intro

In this series we will be writing our own [league of legends](https://www.leagueoflegends.com/) probuilds.

*A league of legend probuilds provide easy access league of legends to Pro players builds accross regions ex: ([probuilds.net](https://www.probuilds.net/), [probuildstats.com](https://probuildstats.com/))*

It's an interesting app to develop, together we will:
- consume the [REST riot api](https://developer.riotgames.com/)
- make a [cron](https://en.wikipedia.org/wiki/Cron) like process to fetch fresh data
- insert it in our database using [transaction](https://en.wikipedia.org/wiki/Database_transaction)
- display it on a nice styled dashboard with [tailwindcss](https://tailwindcss.com/)
- add new data in realtime to our dashboard with [Phoenix PubSub](https://hexdocs.pm/phoenix_pubsub/Phoenix.PubSub.html)
- deploy it to production with [fly.io](https://fly.io/)

{{< newsletter >}}

## Have a peak 👀 at the final result
https://probuild.fly.dev/

## Stack used

- [Elixir language](https://elixir-lang.org/):
  - A dynamic, functional language for building scalable and maintainable applications
- [Phoenix Framework](https://www.phoenixframework.org/)
  - The goto web framework for Elixir language that gives you peace of mind from development to production
- [Phoenix LiveView](https://hexdocs.pm/phoenix_live_view/Phoenix.LiveView.html)
  - Enables rich, real-time user experiences with server-rendered HTML
- [tailwindcss](https://tailwindcss.com/)
  - A utility-first CSS framework
- [postgreSQL](https://www.postgresql.org/)
  - Free and open-source relational database

If you are new to Elixir / Phoenix Framework you will have to install:
- https://elixir-lang.org/install.html
- https://hexdocs.pm/phoenix/installation.html
- https://www.postgresql.org/download/

## App UI

### UI Diagram

I used [excalidraw](https://excalidraw.com/) to make this diagram.

{{< lightbox
  src="/posts/probuild-ex-part-one/1-app-diagram.png"
  alt="probuild ex UI diagram"
>}}

I took inspiration from [probuilds.net](https://www.probuilds.net/) and [probuildstats.com](https://probuildstats.com/)

### Features

- Display games as row with the game time, the pro player, the matchup and some other stats.
- Query the games by champion, pro player, roles and regions
- Toogle a row to get the full game detail.
- Get new game added to the app in real time.

## Data modeling & data sources

### Riot api

The [riot api](https://developer.riotgames.com/) is a JSON REST api with many endpoints.

We are interested in two kind of endpoints [summoner-v4](https://developer.riotgames.com/apis#summoner-v4) and the [match-v5](https://developer.riotgames.com/apis#match-v5).

The summoner represent a league of legends account. Pro players have many accounts in differents regions.

{{< code language="json" title="A Summoner json" >}}
{
    "id": "2cNWTjUhUDNQlS-WEB1mIj6bePcdTxz17Gecw4RDQ90H4qA",
    "accountId": "5H_Q0vPz0WFtt1mzOKicsavLEuYjLSDG-gNsKVBO4FjQBg",
    "puuid": "8tjefad_ZLY2X8UbmwYlR1PBtaRgJBxcOcvFZ8tMy6f4bw56fMaIvLoqA87DK3yzqihZs7L-VQCdBw",
    "name": "GodinDatZotak",
    "profileIconId": 7,
    "revisionDate": 1662838064000,
    "summonerLevel": 115
}
{{< /code >}}

The match represent a game of league of legend. It's a lot of data there, we will just take what we need. You can check a match full definition on the riot api documentation [getMatch](https://developer.riotgames.com/apis#match-v5/GET_getMatch)

{{< code language="json" title="A Match json" >}}
{
    "metadata": ...,
    "info": {
        "gameDuration": 1052,
        "gameId": 6060276174,
        "participants": [
          {
            "kills": 1,
            "assists": 1,
            "deaths": 1
            ...
          },
          ...
        ]
    }
}
{{< /code >}}

### Pro players list

There is no open/free api to my knowledge of league professional player. The more accessible data about pro player is an endpoint on [U.GG](u.gg). I asked them before on their discord and it's not against their TOS to use the endpoint.

`https://stats2.u.gg/pro/pro-list.json`

*One summoner from UGG json*
```json
[
  {
    "current_ign": "Hide on bush",
    "current_team": "T1",
    "league": "LCK",
    "main_role": "mid",
    "normalized_name": "faker",
    "official_name": "Faker",
    "region_id": "kr"
  },
  ...
]
```

### DB diagram

I used [datagrip](https://www.jetbrains.com/datagrip/) to make this DB diagram.

- `team` have many pro players (ex: T1)
- `pro` have many summoners (multiples league of legends accounts ex: "Faker")
- `summoner` have many participants (ex: "Hide on bush")
- `game` have 10 participants (league of legends is a 5vs5 players game)
- `participant` have one opponent `participant` (participant have an opponent in the enemy team who have the same position ex: Middle, Top ...)


[![Db diagram datagrip](/posts/probuild-ex-part-one/2-db-diagram.png)](/posts/probuild-ex-part-one/2-db-diagram.png)


## Show me the code!

The final repo is on [github](https://github.com/mrdotb/probuild_ex) in case you get lost or you want to skip some step you can checkin a specific part there.

## Bootstrap phoenix & HTTP client & schemas and migrations

### Generate a new Phoenix project and install dependencies - [commit](https://github.com/mrdotb/probuild_ex/commit/7388ce67fec3f56309232f55fe4759feb0437bda)

*If you did not install elixir, phoenix and postgres yet check the links in [stack used](#stack-used)*


Install the Phoenix project generator [phx.new](https://hexdocs.pm/phoenix/Mix.Tasks.Phx.New.html) (if you don’t already have it installed) by running:
```
mix archive.install hex phx_new 1.6.12
```

Generate a new Phoenix project with (we don't need the mailer and the internationalization)
```
mix phx.new --no-gettext --no-mailer probuild_ex
```

Once the project is created, open up `mix.exs`. We will add [tesla](https://hexdocs.pm/tesla/readme.html) my goto HTTP client and [hackney](https://github.com/benoitc/hackney) to use as an adapter. In the `deps` section add.

```elixir
  defp deps do
    [
      ...
      {:tesla, "~> 1.4"},
      {:hackney, "~> 1.13"}
    ]
  end
```

Then open up `config/config.exs` and add this line

```elixir
config :tesla, :adapter, Tesla.Adapter.Hackney
```

### Fetch pro player from UGG endpoint - [commit](https://github.com/mrdotb/probuild_ex/commit/4b9252a9675364e254757b88145c03b94e626260)

Create a new file in `lib/probuild_ex/ugg.ex`

```elixir
defmodule ProbuildEx.UGG do
  @moduledoc false

  @url "https://stats2.u.gg/pro/pro-list.json"
  # If they change the endpoint in the future you can use the url below instead
  # it's a snapshot of the pro-list.json endpoint the 13 August 2022
  # @url "https://gist.githubusercontent.com/mrdotb/0d11ce00445de1f2573b8e74a9fcc5f7/raw/a0ff759bb1b794611f8c7a60b2a68bdc7d5eba80/pro-list.json"

  def pro_list do
    %{body: body} = Tesla.get!(@url)
    Jason.decode!(body)
  end
end
```

The `pro_list/0` function above in the module will do a `GET` request to the UGG endpoint then pass the body to [Jason](https://github.com/michalmuskala/jason) to convert this JSON result to an elixir representation.

Let's test our module from IEx (Elixir's interactive shell)
```shell
iex -S mix phx.server
iex> ProbuildEx.UGG.pro_list()
[
  %{
    "current_ign" => "서쪽에서 최고",
    "current_team" => "Golden Guardians",
    "league" => "LCS",
    "main_role" => "top",
    "normalized_name" => "licorice",
    "official_name" => "Licorice",
    "region_id" => "kr"
  },
  %{
    "current_ign" => "TitaN",
    "current_team" => "RED Kalunga",
    "league" => "CBLOL",
    "main_role" => "adc",
    "normalized_name" => "titan",
    "official_name" => "TitaN",
    "region_id" => "br1"
  },
  ...
]
```
Looks nice we got our list of pro player in elixir.


### Fetch riot data from their api - [commit](https://github.com/mrdotb/probuild_ex/commit/415040b60d6d304ade88ddb0309554f90fa62c0d)

You will need a league of [league of legends](https://www.leagueoflegends.com/) account to get a riot token from their [dashboard](https://developer.riotgames.com/).

{{< lightbox
  src="/posts/probuild-ex-part-one/3-developer-riotgames.png"
  alt="riot game developer get token"
>}}

We will put the token in a local dev config. It's good practice to ignore tokens from git.

Edit file `.gitignore`

```
# ignore local config files
/config/*.local.exs
```

Edit file `config/dev.exs` add to the bottom
```elixir
if File.exists?(Path.expand("dev.local.exs", __DIR__)) do
  import_config "dev.local.exs"
end
```

Create file `config/dev.local.exs`
```elixir
import Config

# put your token below 
config :probuild_ex, ProbuildEx.RiotApi, token: "RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx"
```

Now that we got the token in our config we can create the `RiotApi` module

Create a new file in `lib/probuild_ex/riot_api.ex`

```elixir
defmodule ProbuildEx.RiotApi do
  @moduledoc """
  A thin wrapper around the rest riot api for the endpoint we are interested in.
  """

  require Logger

  @ranked_solo_game 420

  @regions_routing_map %{
    "americas" => ["na1", "br1", "la1", "la2"],
    "asia" => ["kr", "jp1"],
    "europe" => ["eun1", "euw1", "tr1", "ru"],
    "sea" => ["oc1"]
  }

  @regions Map.keys(@regions_routing_map)

  @platform_ids_routing_map %{
    "br1" => "americas",
    "jp1" => "asia",
    "kr" => "asia",
    "la1" => "americas",
    "la2" => "americas",
    "na1" => "americas",
    "oc1" => "sea",
    "ru" => "europe",
    "tr1" => "europe",
    "eun1" => "europe",
    "euw1" => "europe"
  }

  @platform_ids Map.keys(@platform_ids_routing_map)

  # Get token from config.
  defp token do
    Application.get_env(:probuild_ex, __MODULE__)[:token]
  end

  @doc """
  Create a tesla client.
  """
  def new(region, option \\ nil) do
    middlewares = [
      # this will make the request retry automatically when we hit the rate limit
      # and get a 429 status or the riot api return a 500 status
      {Tesla.Middleware.Retry,
       [
         delay: 10_000,
         max_retries: 20,
         max_delay: 60_000,
         should_retry: fn
           {:ok, %{status: status}} when status in [429, 503] -> true
           {:ok, _} -> false
           {:error, _} -> true
         end
       ]},
      # pass the riot token in header
      {Tesla.Middleware.Headers, [{"X-Riot-Token", token()}]},
      # set the BaseUrl depending what region endpoint we want to call
      {Tesla.Middleware.BaseUrl, url(region, option)},
      # parse the JSON response automatically
      Tesla.Middleware.JSON,
      # Logger
      Tesla.Middleware.Logger
    ]

    Tesla.client(middlewares)
  end

  # Depending on the endpoint we need to put a region or a platform_id
  # in some case we want the region who match the platform_id
  defp url(region_or_platform_id, option)

  defp url(region, nil) when region in @regions do
    "https://#{region}.api.riotgames.com"
  end

  defp url(platform_id, nil) when platform_id in @platform_ids do
    "https://#{platform_id}.api.riotgames.com"
  end

  defp url(platform_id, :convert_platform_to_region_id) when platform_id in @platform_ids do
    region = Map.get(@platform_ids_routing_map, platform_id)
    url(region, nil)
  end

  @doc """
  Given a tesla client a puuid and optionnaly a start return a list of
  ranked_solo_game match ids.
  ## Example
    iex> RiotApi.list_matches(client, "8tjefad_ZLY2X8UbmwYlR1PBtaRgJBxcOcvFZ8tMy6f4bw56fMaIvLoqA87DK3yzqihZs7L-VQCdBw")
    ["EUW1_5794787018", "EUW1_5786706582", "EUW1_5777719214", "EUW1_5723851410",
     "EUW1_5630385359", "EUW1_5630305794", ...]
  """
  def list_matches(client, puuid, start \\ 0) do
    path = "/lol/match/v5/matches/by-puuid/#{puuid}/ids?"
    query = URI.encode_query(start: start, count: 100, queue: @ranked_solo_game)

    %{body: match_ids, status: 200} = Tesla.get!(client, path <> query)
    match_ids
  end

  @doc """
  Given a tesla client and a match_id return a match_data.
  ## Example
    iex> RiotApi.fetch_match(client, "EUW1_5794787018")
    {:ok,
      %{
        "info" => ...,
        "metadata" => ...
      }
    }
  """
  def fetch_match(client, match_id) do
    path = "/lol/match/v5/matches/#{match_id}"

    case Tesla.get!(client, path) do
      %{status: 200, body: match_data} ->
        {:ok, match_data}

      %{status: 404} ->
        {:error, :not_found}

      other ->
        Logger.error(other)
        {:error, :unknow_error}
    end
  end

  @doc """
  Given a tesla client and a summoner_name get summoner_data
  ## Example
    iex> RiotApi.fetch_summoner_by_name(client, "godindatzotak")
    {:ok,
     %{
       "accountId" => "5H_Q0vPz0WFtt1mzOKicsavLEuYjLSDG-gNsKVBO4FjQBg",
       "id" => "2cNWTjUhUDNQlS-WEB1mIj6bePcdTxz17Gecw4RDQ90H4qA",
       "name" => "GodinDatZotak",
       "profileIconId" => 7,
       "puuid" => "8tjefad_ZLY2X8UbmwYlR1PBtaRgJBxcOcvFZ8tMy6f4bw56fMaIvLoqA87DK3yzqihZs7L-VQCdBw",
       "revisionDate" => 1660161403000,
       "summonerLevel" => 112
     }}
  """
  def fetch_summoner_by_name(client, summoner_name) do
    path = "/lol/summoner/v4/summoners/by-name/#{summoner_name}"

    case Tesla.get!(client, path) do
      %{status: 200, body: summoner_data} ->
        {:ok, summoner_data}

      %{status: 404} ->
        {:error, :not_found}

      other ->
        Logger.error(other)
        {:error, :unknow_error}
    end
  end

  @doc """
  Given a tesla client and a puuid get summoner_data
  Keep in mind that puuid depends on your Token
  ## Example
    iex> RiotApi.fetch_summoner_by_puuid(client, "8tjefad_ZLY2X8UbmwYlR1PBtaRgJBxcOcvFZ8tMy6f4bw56fMaIvLoqA87DK3yzqihZs7L-VQCdBw")
    {:ok,
     %{
       "accountId" => "5H_Q0vPz0WFtt1mzOKicsavLEuYjLSDG-gNsKVBO4FjQBg",
       "id" => "2cNWTjUhUDNQlS-WEB1mIj6bePcdTxz17Gecw4RDQ90H4qA",
       "name" => "GodinDatZotak",
       "profileIconId" => 7,
       "puuid" => "8tjefad_ZLY2X8UbmwYlR1PBtaRgJBxcOcvFZ8tMy6f4bw56fMaIvLoqA87DK3yzqihZs7L-VQCdBw",
       "revisionDate" => 1660161403000,
       "summonerLevel" => 112
     }}
  """
  def fetch_summoner_by_puuid(client, puuid) do
    path = "/lol/summoner/v4/summoners/by-puuid/#{puuid}"

    case Tesla.get!(client, path) do
      %{status: 200, body: summoner_data} ->
        {:ok, summoner_data}

      %{status: 404} ->
        {:error, :not_found}

      other ->
        Logger.error(other)
        {:error, :unknow_error}
    end
  end
end
```

The `platform_ids` and `regions` Map on the top are used to construct the url depending on the ressource `match`, `summoner` we need to use the `region` or `platform_id` in the request url.
Ex:
- `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/8tjefad_ZLY2X8UbmwYlR1PBtaRgJBxcOcvFZ8tMy6f4bw56fMaIvLoqA87DK3yzqihZs7L-VQCdBw/ids?start=0&count=20`
- `https://eun1.api.riotgames.com/lol/summoner/v4/summoners/by-account/CZV2GRJ_26fBaV87oUY8LYWFVVlXbUjkG5bKHFWXzfZex20`

The HTTP client [tesla](https://hexdocs.pm/tesla/readme.html) come with many usefull middlewares.
A tesla middleware is an extra step before / after the request to modify it.
The api is rate limited and return 429 and sometimes 503 the Retry middleware will retry automatically, the others middleware are self explanatory.

We implemented the four calls needed to the [riot api](https://developer.riotgames.com/apis):
- `GET /lol/match/v5/matches/by-puuid/:puuid/ids`
- `GET /lol/match/v5/matches/:match_id`
- `GET /lol/summoner/v4/summoners/by-name/:name`
- `GET /lol/summoner/v4/summoners/by-puuid/:puuid`

Let's test our module from IEx
```shell
iex -S mix phx.server
iex> client_euw1 = ProbuildEx.RiotApi.new("euw1")
%Tesla.Client{ ... }
iex> {:ok, summoner} = ProbuildEx.RiotApi.fetch_summoner_by_name(client_euw1, "godindatzotak")
{:ok,
 %{
   "accountId" => "Yswxna2EdGrxiY-278KVBej4a1RdE6SeiHa8btUKZpefUw",
   "id" => "dw7jlSdJXZaoQtnITLEQPp-cSIRxQt2NUSQ__MZyvlmCvQA",
   "name" => "GodinDatZotak",
   "profileIconId" => 7,
   "puuid" => "RHEsqWf2CHJldRo39tu0RaejKyI6ZXQt1JfkhavIPZ1m-EBzW9JLNKRGKYmwNJTT1mdJgBi7FErztg",
   "revisionDate" => 1664038307000,
   "summonerLevel" => 118
 }}
iex> client_europe = ProbuildEx.RiotApi.new("europe")
%Tesla.Client{ ... }
iex> ProbuildEx.RiotApi.list_matches(client_europe, summoner["puuid"])
["EUW1_6077658796", "EUW1_6007773996",  ...]
```
Looks nice we get the summoner for a name then we list his matches.



### Migrations & schemas - [commit](https://github.com/mrdotb/probuild_ex/commit/423fd0aa116db03456a3c49363b413c2a567ba60)

We will create our 5 entities following the previous [diagram](#db-diagram)

We will use [phx.gen.schema](https://hexdocs.pm/phoenix/Mix.Tasks.Phx.Gen.Schema.html) to bootstrap our migration and ecto schema quickly.

```elixir
mix phx.gen.schema Games.Team teams name:text:unique
```

```elixir
mix phx.gen.schema Games.Pro pros name:text:unique team_id:references:teams
```

```elixir
mix phx.gen.schema Games.Summoner summoners \
  name:text puuid:text \
  platform_id:enum:br1:eun1:euw1:jp1:kr:la1:la2:na1:oc1:ru:tr1 \
  pro_id:references:pros
```

```elixir
mix phx.gen.schema Games.Game games \
  creation:utc_datetime duration:integer \
  platform_id:enum:br1:eun1:euw1:jp1:kr:la1:la2:na1:oc1:ru:tr1 \
  riot_id:text:unique version:text winner:integer
```

```elixir
mix phx.gen.schema Games.Participant participants \
  assists:integer champion_id:integer deaths:integer gold_earned:integer \
  items:array:integer kills:integer summoners:array:integer \
  team_position:enum:UTILITY:TOP:JUNGLE:MIDDLE:BOTTOM \
  team_id:integer win:boolean \
  game_id:references:games summoner_id:references:summoners \
  opponent_participant_id:references:participants
```

We will need to tweak a bit the generated schemas and migrations.
I like to disallow `NULL` value in my database unless it's needed which is not the default with [ecto](https://hexdocs.pm/phoenix/ecto.html).
We will also set the `on_delete:` to `:delete_all` for delete to Cascade properly.

*Replace XXXXXXXX with the timestamp*

#### Edit `migrations/XXXXXXXXXX_create_teams.exs`
```elixir
add :name, :string, null: false
```
We set `:name` non `NULL`.


#### Edit `migration/XXXXXXXXX_create_pros.exs`
```elixir
add :name, :text, null: false
add :team_id, references(:teams, on_delete: :delete_all), null: false
```
We set attributes non `NULL` and add a `on_delete:` `:delete_all` to properly Cascade the delete.


#### Edit `lib/probuild_ex/games/pro.ex`
```elixir
defmodule ProbuildEx.Games.Pro do
  use Ecto.Schema
  import Ecto.Changeset

  alias ProbuildEx.Games.Team

  schema "pros" do
    field :name, :string
    belongs_to :team, Team

    timestamps()
  end

  @doc false
  def changeset(pro, attrs) do
    pro
    |> cast(attrs, [:name, :team_id])
    |> validate_required([:name, :team_id])
    |> unique_constraint(:name)
    |> foreign_key_constraint(:team_id)
  end
end
```
We add `belongs_to` to `Team` and add some contraint check in the [changeset](https://hexdocs.pm/ecto/Ecto.Changeset.html).


#### Edit `migration/XXXXXXXXX_create_summoners.exs`
```elixir
defmodule ProbuildEx.Repo.Migrations.CreateSummoners do
  use Ecto.Migration

  def change do
    create table(:summoners) do
      add :name, :text, null: false
      add :puuid, :text, null: false
      add :platform_id, :string, null: false
      # Note the pro_id can be null
      add :pro_id, references(:pros, on_delete: :delete_all), null: true

      timestamps()
    end

    create unique_index(:summoners, [:puuid, :platform_id])
    create index(:summoners, [:pro_id])
  end
end
```
We set attributes non `NULL` and the `:on_delete` like before. We also create a unique index using the `puuid` and `platform_id` to prevent duplicate. (I encounter a case where two summoners got the same puuid in different region)


#### Edit `lib/probuild_ex/games/summoner.ex`
```elixir
defmodule ProbuildEx.Games.Summoner do
  use Ecto.Schema
  import Ecto.Changeset

  alias ProbuildEx.Games.Pro

  schema "summoners" do
    field :name, :string
    field :platform_id, Ecto.Enum, values: [:br1, :eun1, :euw1, :jp1, :kr, :la1, :la2, :na1, :oc1, :ru, :tr1]
    field :puuid, :string

    belongs_to :pro, Pro

    timestamps()
  end

  @doc false
  def changeset(summoner, attrs) do
    summoner
    |> cast(attrs, [:puuid, :platform_id, :pro_id, :name])
    |> validate_required([:puuid, :platform_id, :name])
    |> unique_constraint([:puuid, :platform_id], name: "summoners_puuid_platform_id_index")
    |> foreign_key_constraint(:pro_id)
  end
end
```
Same as before we add a `belongs_to` and add constraint check in the changeset.


#### Edit `migration/XXXXXXXXX_create_games.exs`
```elixir
add :creation, :utc_datetime, null: false
add :duration, :integer, null: false
add :platform_id, :text, null: false
add :riot_id, :string, null: false
add :version, :text, null: false
add :winner, :smallint, null: false
```
Same as before we disallow `NULL`


#### Edit `lib/probuild_ex/games/summoner.ex`
```elixir
defmodule ProbuildEx.Games.Game do
  use Ecto.Schema
  import Ecto.Changeset

  alias ProbuildEx.Games.Participant

  schema "games" do
    field :creation, :utc_datetime
    field :duration, :integer
    field :platform_id, Ecto.Enum, values: [:br1, :eun1, :euw1, :jp1, :kr, :la1, :la2, :na1, :oc1, :ru, :tr1]
    field :riot_id, :string
    field :version, :string
    field :winner, :integer

    has_many :participants, Participant

    timestamps()
  end

  @doc false
  def changeset(game, attrs) do
    game
    |> cast(attrs, [:creation, :duration, :platform_id, :riot_id, :version, :winner])
    |> validate_required([:creation, :duration, :platform_id, :riot_id, :version, :winner])
    |> unique_constraint(:riot_id)
  end
end
```
We add `has_many` `Participant`.


#### Edit `migration/XXXXXXXXX_create_participants.exs`

```elixir
defmodule ProbuildEx.Repo.Migrations.CreateParticipants do
  use Ecto.Migration

  def change do
    create table(:participants) do
      add :assists, :integer, null: false
      add :champion_id, :integer, null: false
      add :deaths, :integer, null: false
      add :gold_earned, :integer, null: false
      add :items, {:array, :integer}, null: false
      add :kills, :integer, null: false
      add :summoners, {:array, :integer}, null: false
      add :team_position, :string, null: false
      add :team_id, :integer, null: false
      add :win, :boolean, null: false
      add :game_id, references(:games, on_delete: :delete_all), null: false
      add :summoner_id, references(:summoners, on_delete: :delete_all), null: false
      # Note the opponent_participant can be null
      add :opponent_participant_id, references(:participants, on_delete: :delete_all), null: true

      timestamps()
    end

    create index(:participants, [:game_id])
    create index(:participants, [:summoner_id])
    create index(:participants, [:opponent_participant_id])
  end
end
```
We set attributes non `NULL` and the `:on_delete` like before.


#### Edit `lib/probuild_ex/games/participant.ex`
```elixir
defmodule ProbuildEx.Games.Participant do
  use Ecto.Schema
  import Ecto.Changeset

  alias ProbuildEx.Games.{
    Game,
    Participant,
    Summoner
  }

  schema "participants" do
    field :assists, :integer
    field :champion_id, :integer
    field :deaths, :integer
    field :gold_earned, :integer
    field :items, {:array, :integer}
    field :kills, :integer
    field :summoners, {:array, :integer}
    field :team_id, :integer
    field :team_position, Ecto.Enum, values: [:UTILITY, :TOP, :JUNGLE, :MIDDLE, :BOTTOM]
    field :win, :boolean, default: false

    belongs_to :game, Game
    belongs_to :summoner, Summoner
    belongs_to :opponent_participant, Participant

    timestamps()
  end

  @doc false
  def changeset(participant, attrs) do
    participant
    |> cast(attrs, [
      :assists,
      :champion_id,
      :deaths,
      :gold_earned,
      :items,
      :kills,
      :summoners,
      :team_position,
      :team_id,
      :win,
      :game_id,
      :summoner_id,
      :opponent_participant_id
    ])
    |> validate_required([
      :assists,
      :champion_id,
      :deaths,
      :gold_earned,
      :items,
      :kills,
      :summoners,
      :team_position,
      :team_id,
      :win,
      :game_id,
      :summoner_id
    ])
    |> foreign_key_constraint(:game_id)
    |> foreign_key_constraint(:summoner_id)
    |> foreign_key_constraint(:opponent_participant_id)
  end
end
```
We add `belongs_to` and `foreign_key_constraint`.

#### Running migrations
All our migrations are ready let's run them.
```elixir
mix ecto.migrate
```

### Closing thoughts

Well done and thanks for sticking with me to the end! We built the foundation for our probuild application, created our HTTP clients to UGG and the riot api and modelling our database.

In the next part we will focus on collecting the Pros and Games data with GenServer processes and insert those in our database.

Be sure to sign up to the newsletter so that you won't miss the next Part. Feel free to leave comments or feedback. See you soon !
{{< newsletter >}}
