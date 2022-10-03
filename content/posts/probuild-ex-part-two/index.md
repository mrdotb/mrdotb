+++
title = 'Probuild Ex Part two'
date = '2022-10-03T16:44:01+02:00'
author = 'mrdotb'
description = 'A league of legend probuilds with elixir phoenix, part two'
tags = ['elixir', 'ecto', 'multi', 'GenServer', 'Stream', 'phoenix', 'tutorial', 'riot api']
toc = true
showReadingTime = true
cover = "/posts/probuild-ex-part-two/cover.png"
+++

## Intro

In [Part one](/posts/probuild-ex-part-one/) we created our HTTP clients and model our data. 
In this second part, we are going to organize the data collection and creation through modules and processes.
Part two assumes that you have already gone through Part one and have the code at a point where we can jump right in. If you want to checkout the companion code and fast forward to this point, do the following:

```shell
git clone https://github.com/mrdotb/probuild_ex.git
cd probuild_ex
git checkout 423fd0aa116db03456a3c49363b413c2a567ba60
```

{{< newsletter >}}

## Have a peak 👀 at the end of series application
https://probuild.fly.dev/

## Modules Diagram

Here is a diagram of what we are going to do.

{{< lightbox
  src="/posts/probuild-ex-part-two/1-canon-diagram.png"
  alt="Canons diagram mrdotb"
>}}

- `Games` a context module holding the functions to query and insert data in postgres.
- `Canon` a set of 3 modules:
  - `Canon.Pros` glue between the `UGG` and `Riot Api` responsable to get the external data of the pro player and pass it through the `Games` context for creation.
  - `Canon.Games` glue between the `Riot Api` responsable to get the pro games data and pass it through the `Games` context for creation.
  - `Canon.Cron` responsable to run `Canon.Pros` every 24 hours and `Games` in loop.
- `UGG` is a HTTP client done in part one.
- `RiotApi` is a HTTP client done in part one.


## Games context first part and canon Pros - [commit](https://github.com/mrdotb/probuild_ex/commit/89b2a921c72e0e7e556a7f8751ab6308e8c835e3)
We are going to create the `Games` context with functions to fetch and create the `team`, `pro` and `summoner`.


### Games context

Create a new file `lib/probuild_ex/games.ex`
```elixir
defmodule ProbuildEx.Games do
  @moduledoc """
  The context module to manage the creation / updates of schemas.
  """

  import Ecto.Query

  alias ProbuildEx.Repo

  alias ProbuildEx.Games.{
    Pro,
    Summoner,
    Team
  }

  @doc """
  Create a Pro with his team and summoner inside a transaction.
  """
  def create_pro_complete(ugg_pro, summoner_data) do
    Repo.transaction(fn ->
      with {:ok, team} <- fetch_or_create_team(ugg_pro["current_team"]),
           {:ok, pro} <- fetch_or_create_pro(ugg_pro["official_name"], team.id),
           attrs <-
             Map.merge(summoner_data, %{
               "platform_id" => ugg_pro["region_id"],
               "pro_id" => pro.id
             }),
           {:ok, summoner} <- update_or_create_summoner(attrs) do
        %{team: team, pro: pro, summoner: summoner}
      else
        {:error, error} -> Repo.rollback(error)
      end
    end)
  end

  @doc """
  Fetch or create a team based on name.
  """
  def fetch_or_create_team(name) do
    case Repo.get_by(Team, name: name) do
      nil ->
        changeset = Team.changeset(%Team{}, %{name: name})
        Repo.insert(changeset)

      team ->
        {:ok, team}
    end
  end

  @doc """
  Fetch or create a pro based on name and team_id.
  """
  def fetch_or_create_pro(name, team_id) do
    case Repo.get_by(Pro, name: name, team_id: team_id) do
      nil ->
        changeset = Pro.changeset(%Pro{}, %{name: name, team_id: team_id})
        Repo.insert(changeset)

      pro ->
        {:ok, pro}
    end
  end

  @doc """
  Fetch a summoner using options.

  Options:

    * `name`
    * `puuid`
    * `platform_id`
    * `is_pro?`

  ## Example

      iex> Games.fetch_summoner(name: "Hide on bush", is_pro?: true)
      {:ok, %Summoner{}}

      iex> Games.fetch_summoner(name: "Hide on bush", is_pro?: false)
      {:error, :not_found}
  """
  def fetch_summoner(opts) do
    base_query = from(summoner in Summoner)
    query = Enum.reduce(opts, base_query, &reduce_summoner_opts/2)

    case Repo.one(query) do
      nil -> {:error, :not_found}
      summoner -> {:ok, summoner}
    end
  end

  defp reduce_summoner_opts({:name, name}, query) do
    from summoner in query,
      where: summoner.name == ^name
  end

  defp reduce_summoner_opts({:puuid, puuid}, query) do
    from summoner in query,
      where: summoner.puuid == ^puuid
  end

  defp reduce_summoner_opts({:platform_id, platform_id}, query) do
    from summoner in query,
      where: summoner.platform_id == ^platform_id
  end

  defp reduce_summoner_opts({:is_pro?, true}, query) do
    from summoner in query,
      where: not is_nil(summoner.pro_id)
  end

  defp reduce_summoner_opts({:is_pro?, false}, query) do
    from summoner in query,
      where: not is_nil(summoner.pro_id)
  end

  defp reduce_summoner_opts({key, value}, _query),
    do: raise("not supported option #{inspect(key)} with value #{inspect(value)}")

  @doc """
  Create summoner
  """
  def create_summoner(attrs) do
    %Summoner{}
    |> Summoner.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Update summoner
  """
  def update_summoner(summoner, attrs) do
    summoner
    |> Summoner.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Update or Create summoner
  it's possible that the summoner already exist in our database but it is not attached
  to a pro player
  """
  def update_or_create_summoner(attrs) do
    opts = [puuid: attrs["puuid"], platform_id: attrs["platform_id"]]

    case fetch_summoner(opts) do
      {:ok, summoner} ->
        update_summoner(summoner, attrs)

      {:error, :not_found} ->
        create_summoner(attrs)
    end
  end
end
```

Our `Games` module have many functions let's explain a bit.

The `create_pro_complete/2` function takes for parameter a ugg_pro and his summoner_data from riot_api.
The work will be done inside a [database transaction](https://en.wikipedia.org/wiki/Database_transaction):
- it will create or fetch the team of this pro player
- it will create or fetch the pro player
- it will update or create the summoner, summoner get a different treatment because they can change. (name change, get attached to a pro player)
If something go wrong the transaction is discarded and nothing is created / updated otherwise we return a map with the keys `:team`, `:pro`, `:summoner`.

The `fetch_summoner/1` function take for parameters an options keyword to perform a search on the summoners. We are using the [ecto query composition](https://elixirschool.com/blog/ecto-query-composition) method.


### Games context fixtures and tests

Now, we will test the function in our `Games` module. For this purpose we will create a test fixtures and a test file.

*A test fixture is a fixed state of a set of objects used as a baseline for running tests. The purpose of a test fixture is to ensure that there is a well known and fixed environment in which tests are run so that results are repeatable.*


Let's create our fixtures, create a folder `mkdir test/support/fixtures` then a new file `test/support/fixtures/games_fixtures.ex`
```elixir
defmodule ProbuildEx.GamesFixtures do
  @moduledoc """
  This module defines test helpers for creating
  entities via the `Games` context.
  """

  @doc """
  Generate a unique team name.
  """
  def unique_team_name, do: "team name #{System.unique_integer([:positive])}"

  @doc """
  Generate a team.
  """
  def team_fixture(name \\ unique_team_name()) do
    {:ok, team} = ProbuildEx.Games.fetch_or_create_team(name)

    team
  end

  @doc """
  Generate a unique pro name.
  """
  def unique_pro_name, do: "pro name #{System.unique_integer([:positive])}"

  @doc """
  Generate a pro.
  """
  def pro_fixture(name \\ unique_pro_name(), team \\ team_fixture()) do
    {:ok, pro} = ProbuildEx.Games.fetch_or_create_pro(name, team.id)

    pro
  end

  @doc """
  Generate a unique attrs for summoner.
  """
  def unique_summoner_attrs(attrs \\ %{}) do
    summoner_name = "summoner name #{System.unique_integer([:positive])}"
    puuid = Ecto.UUID.generate()

    Enum.into(
      attrs,
      %{
        "name" => summoner_name,
        "platform_id" => "euw1",
        "puuid" => puuid
      }
    )
  end

  @doc """
  Generate a summoner.
  """
  def summoner_fixture(attrs \\ %{}, pro \\ pro_fixture()) do
    attrs =
      attrs
      |> Map.put("pro_id", pro.id)
      |> unique_summoner_attrs()

    {:ok, summoner} = ProbuildEx.Games.create_summoner(attrs)
    summoner
  end
end
```

Create a new file `test/probuild_ex/games_test.ex`
```elixir
defmodule ProbuildEx.GamesTest do
  use ExUnit.Case, async: true
  use ProbuildEx.DataCase

  import ProbuildEx.GamesFixtures

  alias ProbuildEx.Games

  describe "team" do
    test "fetch_or_create_team/1 should create team then fetch it" do
      unique_team_name = unique_team_name()
      assert {:ok, created_team} = Games.fetch_or_create_team(unique_team_name)
      assert {:ok, fetched_team} = Games.fetch_or_create_team(unique_team_name)
      assert created_team.id == fetched_team.id
    end
  end

  describe "Pro" do
    test "fetch_or_create_pro/2 should create team then fetch it" do
      team = team_fixture()
      unique_pro_name = unique_pro_name()
      assert {:ok, created_pro} = Games.fetch_or_create_pro(unique_pro_name, team.id)
      assert {:ok, fetched_pro} = Games.fetch_or_create_pro(unique_pro_name, team.id)
      assert created_pro.id == fetched_pro.id
    end
  end

  describe "summoner" do
    test "update_or_create_summoner/1 should create summoner then update it" do
      pro = pro_fixture()
      summoner_attrs = Map.put(unique_summoner_attrs(), "pro_id", pro.id)

      assert {:ok, created_summoner} = Games.update_or_create_summoner(summoner_attrs)

      summoner_attrs = Map.put(summoner_attrs, "name", "faker")
      assert {:ok, updated_summoner} = Games.update_or_create_summoner(summoner_attrs)

      assert created_summoner.id == updated_summoner.id
      assert updated_summoner.name == "faker"
    end

    test "fetch_summoner/1 opts" do
      summoner_fixture(%{"name" => "faker"})
      assert {:ok, _} = Games.fetch_summoner(name: "faker")

      summoner_fixture(%{"puuid" => "123", "platform_id" => "euw1"})
      assert {:ok, _} = Games.fetch_summoner(puuid: "123", platform_id: "euw1")

      summoner_fixture(%{"pro_id" => nil, "puuid" => "abc"})
      assert {:ok, _} = Games.fetch_summoner(is_pro?: false, puuid: "abc")

      summoner_fixture(%{"puuid" => "abcd"})
      assert {:ok, _} = Games.fetch_summoner(is_pro?: true, puuid: "abcd")

      assert {:error, :not_found} = Games.fetch_summoner(puuid: "1234")
    end
  end

  describe "pro transaction" do
    @chovy_ugg %{
      "current_ign" => "Shrimp Shark",
      "current_team" => "Gen.G",
      "league" => "LCK",
      "main_role" => "mid",
      "normalized_name" => "chovy",
      "official_name" => "Chovy",
      "region_id" => "euw1"
    }

    @chovy_summoner_riot %{
      "accountId" => "ei4Gy40LkIa8yXDWgJByZPLwgNBSpTh4GVg7xA1l-RHzq5avJDZq516k",
      "id" => "prjMc2d4I594w7ib9Ws966dDmchDQDxPrY9tckTfrvHuzPCPVIzvoUvapA",
      "name" => "Shrimp Shark",
      "profileIconId" => 29,
      "puuid" => "i91dcy5ekDwcjaHZak-RSmM_NCskwtbH5bLKRwYr_BJvA71QZ14ze61fo4HxkDwJXgk3vfs_bUMqxA",
      "revisionDate" => 1_634_857_524_000,
      "summonerLevel" => 37
    }

    test "create_pro_complete/2 should create team, pro and summoner" do
      assert {:ok, result} = Games.create_pro_complete(@chovy_ugg, @chovy_summoner_riot)
      assert result.team.name == @chovy_ugg["current_team"]
      assert result.pro.name == @chovy_ugg["official_name"]
      assert result.summoner.name == @chovy_summoner_riot["name"]
    end
  end
end
```

Elixir come with his unit testing framework [ExUnit](https://hexdocs.pm/ex_unit/1.12.3/ExUnit.html).

Team, pro and summoner test are self explanatory. We ensure it behave as expected.

To test of our main function `create_pro_complete/2` I choose to pull some real data instead of fixture this way it's easier to understand how it will behave with real data. We call the function and check the returned map and compare it to the provided data.

Let's run our tests.
```shell
mix test
Finished in 0.09 seconds (0.08s async, 0.01s sync)
8 tests, 0 failures
```
Success !

### Canon Pros

Create a new file `lib/probuild_ex/canon/pros.ex`
```elixir
defmodule ProbuildEx.Canon.Pros do
  @moduledoc """
  The Pros Canon pipeline.
  Step:
  - Request the UGG pro_list
  - Filter pro based on the platform_id
  - If the pro summoner does not exist in our database
  - Request RiotApi for the data of this summoner.
  - Create the pro, his team his summoner if they don't exist in our database
  """

  alias ProbuildEx.{
    Games,
    RiotApi,
    UGG
  }

  require Logger

  def run(platform_id \\ "euw1") do
    UGG.pro_list()
    |> Stream.filter(fn ugg_pro ->
      Map.get(ugg_pro, "region_id") == platform_id
    end)
    |> Stream.map(fn ugg_pro ->
      name = Map.get(ugg_pro, "current_ign")
      platform_id = Map.get(ugg_pro, "region_id")
      client = RiotApi.new(platform_id)
      opts = [name: name, platform_id: platform_id, is_pro?: true]

      with {:error, :not_found} <- Games.fetch_summoner(opts),
           {:ok, summoner_data} <- RiotApi.fetch_summoner_by_name(client, name) do
        {ugg_pro, summoner_data}
      else
        {:ok, _summoner} -> {:error, :already_exist}
        {:error, :not_found} -> {:error, :not_found}
      end
    end)
    |> Stream.reject(fn
      {:error, _error} -> true
      {_ugg_pro, _summoner_data} -> false
    end)
    |> Stream.map(fn {ugg_pro, summoner_data} ->
      ugg_pro
      |> Games.create_pro_complete(summoner_data)
      |> log_failed_transaction()
    end)
    |> Stream.run()
  end

  defp log_failed_transaction(result) do
    case result do
      {:ok, _} ->
        :ok

      {:error, any} ->
        Logger.error(any)

      {:error, multi_name, changeset, multi} ->
        Logger.error("""
          multi_name:
          #{inspect(multi_name)}
          changeset:
          #{inspect(changeset)}
          multi:
          #{inspect(multi)}
        """)
    end
  end
end
```

Canon Pros is a good opportunity to use elixir [Stream](https://hexdocs.pm/elixir/Stream.html).

We want the pipeline to be done sequentially because at some point we will exhaust our riot api quota and we will have to wait.

Consider the following code. Try it in iex.
```elixir
(1..5
|> Enum.map(fn n ->
  IO.puts("HTTP request #{n}")
  :timer.sleep(500)
  n
end)
|> Enum.each(fn n ->
  IO.puts("Insert #{n} in db")
end))

HTTP request 1
HTTP request 2
HTTP request 3
HTTP request 4
HTTP request 5
Insert 1 in db
Insert 2 in db
Insert 3 in db
Insert 4 in db
Insert 5 in db
```

*We use `:timer.sleep()` to simulate a HTTP request*

As you can see using `Enum` we need to do all our requests before going to the inserts.

Not let's compare to the `Stream` version

```elixir
(1..5
|> Stream.map(fn n ->
  IO.puts("HTTP request #{n}")
  :timer.sleep(500)
  n
end)
|> Stream.each(fn n ->
  IO.puts("Insert #{n} in db")
end))
|> Stream.run()

HTTP request 1
Insert 1 in db
HTTP request 2
Insert 2 in db
HTTP request 3
Insert 3 in db
HTTP request 4
Insert 4 in db
HTTP request 5
Insert 5 in db
```

You can see that we have the actions are done sequentially `[request] -> [insert] -> [request] ...`

Going back to our `Canon.Pros` we get the UGG pro_list then sequentially:
- filter pro based on the platform_id we intrested in
- filter if summoner already exist in DB
- Request riot API for the summoner
- filter if summoner does not exist in riot API
- Create the pro, his team, his summoner or attach him to existing data if the pro or his team already exist

Refresh your riot token from their [dashboard](https://developer.riotgames.com/) and put it on `config/dev.local.exs`. *Dev token only last 24 hours* like we did in part one.

Now it's time to run our `Canon.Pros` and start collecting pros. You can put one of the `platflorm_id` from this list `["euw1", "jp1", "kr", "na1", "br1"]`
```elixir
ProbuildEx.Canon.Pros.run("kr")
```

Now you should see a mix of HTTP logs from tesla and sql queries and inserts. At some point you should get rate limited. The tesla retry middleware that we setup in part one will kick in and retry until the limit end.

And that's all for `Canon.Pros`! It will take some time to complete depending on the region you choose. But since we do everything in transaction it's safe to kill it anytime and restart it later!


## Games context second part and canon Games - [commit](https://github.com/mrdotb/probuild_ex/commit/e07c1ac64a51a5db9897330648e595437ae5a27d)

### Edit game schema and changeset

Open `lib/probuild_ex/games/game.ex`
```elixir
defmodule ProbuildEx.Games.Game do
  use Ecto.Schema
  import Ecto.Changeset

  alias ProbuildEx.Games.Participant

  schema "games" do
    field :creation_int, :integer, virtual: true
    field :creation, :utc_datetime
    field :duration, :integer

    field :platform_id, Ecto.Enum,
      values: [:br1, :eun1, :euw1, :jp1, :kr, :la1, :la2, :na1, :oc1, :ru, :tr1]

    field :riot_id, :string
    field :version, :string
    field :winner, :integer

    has_many :participants, Participant

    timestamps()
  end

  @doc false
  def changeset(game, attrs) do
    game
    |> cast(attrs, [:creation_int, :duration, :platform_id, :riot_id, :version, :winner])
    |> validate_required([:creation_int, :duration, :platform_id, :riot_id, :version, :winner])
    |> clean_version()
    |> cast_creation()
    |> unique_constraint(:riot_id)
  end

  defp clean_version(changeset) do
    case fetch_change(changeset, :version) do
      {:ok, version} ->
        version =
          version
          |> String.split(".")
          |> Enum.take(2)
          |> Enum.join(".")
          |> Kernel.<>(".1")

        put_change(changeset, :version, version)

      :error ->
        changeset
    end
  end

  defp cast_creation(changeset) do
    case fetch_change(changeset, :creation_int) do
      {:ok, creation_int} ->
        creation =
          creation_int
          |> DateTime.from_unix!(:millisecond)
          |> DateTime.truncate(:second)

        put_change(changeset, :creation, creation)

      :error ->
        changeset
    end
  end
end
```

The creation date we get from riot api is an unix timestamp in millisecond but we want a `utc_datetime`.
For this kind of case when you need to change the type of a data I like to use a [virtual field](https://til.hashrocket.com/posts/5a1c28f560-virtual-fields-with-ecto-schema) in my schema and a function to cast it to the desired type in my changeset `cast_creation/1` here.

Using functions from [`DateTime`](https://hexdocs.pm/elixir/1.13/DateTime.html) we convert the unix timestamp to a `utc_datetime`.

We also want to simplify the `version` provided by the riot api. It will help later when we want to fetch the image of champions, summoners and items.

ex: "12.1.416.4011" should become "12.1.1"


### Games context part two

We are going to add function to the `Games` context to list, create and query `game`, `summoner`, `participant`.

Edit file `lib/probuild_ex/games.ex`
```elixir
defmodule ProbuildEx.Games do
  ...

  alias Ecto.Multi
  alias ProbuildEx.Repo

  alias ProbuildEx.Games.{
    Game,
    Participant,
    Pro,
    Summoner,
    Team
  }

  ...

  @doc """
  List pro summoner per platform_id.
  """
  def list_pro_summoners(platform_id) do
    query =
      from summoner in Summoner,
        where: summoner.platform_id == ^platform_id and not is_nil(summoner.pro_id),
        order_by: [desc: summoner.updated_at]

    Repo.all(query)
  end

  @doc """
  Given a list of riots ids return a list of the one that does not exist in database yet
  """
  def reject_existing_games(riot_ids) do
    query =
      from game in Game,
        where: game.riot_id in ^riot_ids,
        select: game.riot_id

    existing_riot_ids = Repo.all(query)
    Enum.reject(riot_ids, fn riot_id -> riot_id in existing_riot_ids end)
  end

  @doc """
  Create a complete game based on a platform_id, match_data and a list of summoners.
  """
  def create_game_complete(platform_id, match_data, summoners_list) do
    multi = Multi.insert(Multi.new(), :game, change_game(match_data))

    multi =
      Enum.reduce(summoners_list, multi, fn summoner, multi ->
        reduce_put_or_create_summoner(platform_id, summoner, multi)
      end)

    participants = get_in(match_data, ["info", "participants"])

    multi = Enum.reduce(participants, multi, &reduce_create_participant/2)
    multi = Enum.reduce(participants, multi, &reduce_set_opponent_participant/2)

    Repo.transaction(multi)
  end

  defp reduce_put_or_create_summoner(_platform_id, %Summoner{} = summoner, multi) do
    Multi.put(multi, {:summoner, summoner.puuid}, summoner)
  end

  defp reduce_put_or_create_summoner(platform_id, summoner_data, multi) do
    case Map.fetch(summoner_data, "puuid") do
      {:ok, puuid} ->
        attrs = Map.put(summoner_data, "platform_id", platform_id)
        changeset = Summoner.changeset(%Summoner{}, attrs)
        Multi.insert(multi, {:summoner, puuid}, changeset)

      :error ->
        multi
    end
  end

  defp fetch_participant_key(participant_data) do
    with {:ok, team_id} <- Map.fetch(participant_data, "teamId"),
         true <- team_id in [100, 200],
         {:ok, team_position} <- Map.fetch(participant_data, "teamPosition"),
         true <-
           is_binary(team_position) and
             team_position in ["UTILITY", "TOP", "JUNGLE", "MIDDLE", "BOTTOM"] do
      {:ok, {team_id, team_position}}
    else
      _ ->
        :error
    end
  end

  defp get_enemy_team_id(100), do: 200
  defp get_enemy_team_id(200), do: 100

  defp fetch_opponent_participant_key(participant_data) do
    with {:ok, {team_id, team_position}} <- fetch_participant_key(participant_data),
         enemy_team_id <- get_enemy_team_id(team_id) do
      {:ok, {enemy_team_id, team_position}}
    else
      _ ->
        :error
    end
  end

  defp reduce_create_participant(participant_data, multi) do
    result = fetch_participant_key(participant_data)
    reduce_create_participant(result, participant_data, multi)
  end

  defp reduce_create_participant({:ok, participant_key}, participant_data, multi) do
    Multi.insert(
      multi,
      {:participant, participant_key},
      fn changes ->
        case Map.fetch(changes, {:summoner, participant_data["puuid"]}) do
          {:ok, summoner} ->
            change_participant(changes.game, participant_data, summoner)

          :error ->
            # If we can't find the summoner in the changes we put a changeset with
            # error. It will make the multi fail.
            Ecto.Changeset.add_error(%Ecto.Changeset{}, :summoner, "not_found")
        end
      end
    )
  end

  defp reduce_create_participant(:error, _participant_data, multi) do
    multi
  end

  defp reduce_set_opponent_participant(participant_data, multi) do
    Multi.update(
      multi,
      {:update_participant, participant_data["puuid"]},
      fn changes ->
        with {:ok, participant_key} <- fetch_participant_key(participant_data),
             {:ok, opponent_participant_key} <- fetch_opponent_participant_key(participant_data),
             {:ok, participant} <- Map.fetch(changes, {:participant, participant_key}),
             {:ok, opponent_participant} <-
               Map.fetch(changes, {:participant, opponent_participant_key}) do
          change_participant_opponent(participant, opponent_participant.id)
        else
          _ ->
            # There is a missing data in this participant we put a changeset with
            # an error to make the multi fail
            Ecto.Changeset.add_error(%Ecto.Changeset{}, :participant, "not_found")
        end
      end
    )
  end

  def change_game(match_data) do
    game_attrs = %{
      creation_int: get_in(match_data, ["info", "gameCreation"]),
      duration: get_in(match_data, ["info", "gameDuration"]),
      platform_id: get_in(match_data, ["info", "platformId"]) |> String.downcase(),
      riot_id: get_in(match_data, ["metadata", "matchId"]),
      version: get_in(match_data, ["info", "gameVersion"]),
      winner: get_winner_team(match_data)
    }

    Game.changeset(%Game{}, game_attrs)
  end

  defp get_winner_team(match_data) do
    match_data
    |> get_in(~w(info teams)s)
    |> Enum.filter(fn team -> team["win"] end)
    |> List.first()
    |> Kernel.||(%{})
    |> Map.get("teamId")
  end

  def change_participant(game, participant_data, summoner) do
    participant_attrs = %{
      kills: Map.get(participant_data, "kills"),
      deaths: Map.get(participant_data, "deaths"),
      assists: Map.get(participant_data, "assists"),
      champion_id: Map.get(participant_data, "championId"),
      gold_earned: Map.get(participant_data, "goldEarned"),
      summoners: Map.take(participant_data, ["summoner1Id", "summoner2Id"]) |> Map.values(),
      items: Map.take(participant_data, for(n <- 0..6, do: "item#{n}")) |> Map.values(),
      team_position: Map.get(participant_data, "teamPosition"),
      game_id: game.id,
      summoner_id: summoner.id,
      team_id: Map.get(participant_data, "teamId"),
      win: Map.get(participant_data, "win")
    }

    Participant.changeset(%Participant{}, participant_attrs)
  end

  def change_participant_opponent(participant, opponent_participant_id) do
    Participant.changeset(participant, %{opponent_participant_id: opponent_participant_id})
  end
```

Let's discuss the function we added to `Games` context.

`list_pro_summoners/1` parameter are `platform_id` it will query summoner who belongs to this `platform_id` and belongs to a `pro`. This function will be the first called on `Canon.Games`.

`reject_existing_games/1` parameter are a list of `riot_id` it reject the one that already exist in the database and return the one that does not.

`create_game_complete/3` parameters are `platform_id`, `match_data` and a list of `summoner` or `summoner_data`. It's a big transaction where we create the game the summoners and the participants. Because it's a lot of line of code I choose to use [`Ecto.Multi`](https://hexdocs.pm/ecto/Ecto.Multi.html) which is a data structure to organize transaction (check the [doc](https://hexdocs.pm/ecto/Ecto.Multi.html) to learn more about Multi).

Let's recap in order what is happening inside this transaction:
- Create the game and put it to the multi as `:game`
- Loop over `summoners_list` two cases:
  - The summoner already exist on our database in this case we just put it to the multi on key `{:summoner, summoner_puuid}`
  - The summoner does not exist on our database in this case we create it then put it to the multi on key `{:summoner, summoner_puuid}`
- Extract participants from `match_data`
- Loop over participants two cases:
  - The participant is missing some important data (`team_id`, `team_position`) in this case we put an `error` in the changeset and the transaction will fail
  - The participant data is complete in this case we create the participant link it to his summoner and put it in the multi on key `{:participant, {team_id, team_position}}`. ex `{:participant, {100, "MIDDLE"}}`
- Loop over participants again two cases:
  - We can't find the opponent_participant in this case we put an `error` in the changeset and the transaction will fail
  - We can find the opponent_participant in this case we will set the `opponent_participant_id` to the `opponent_id`
- We run our `multi` in `Repo.transaction` if there is no errors all the data will get inserted!


### Games context fixtures and tests

To test the previous code especially `create_game_complete/3` we need a full game data fixture. It's long so the code block below is collapsed.

{{< code language="elixir" title="test/support/fixtures/game_data_fixtures.ex" isCollapsed="true" >}}
defmodule ProbuildEx.GameDataFixtures do
  @platform_id "kr"

  @game_data %{
    "info" => %{
      "gameCreation" => 1_641_927_741_000,
      "gameDuration" => 1828,
      "gameEndTimestamp" => 1_641_929_589_535,
      "gameId" => 5_685_774_969,
      "gameMode" => "CLASSIC",
      "gameName" => "teambuilder-match-5685774969",
      "gameStartTimestamp" => 1_641_927_760_864,
      "gameType" => "MATCHED_GAME",
      "gameVersion" => "12.1.416.4011",
      "mapId" => 11,
      "participants" => [
        %{
          "timeCCingOthers" => 4,
          "teamId" => 100,
          "totalUnitsHealed" => 1,
          "spell4Casts" => 151,
          "objectivesStolen" => 0,
          "kills" => 1,
          "participantId" => 1,
          "visionWardsBoughtInGame" => 2,
          "totalDamageShieldedOnTeammates" => 0,
          "unrealKills" => 0,
          "riotIdTagline" => "",
          "inhibitorKills" => 0,
          "largestCriticalStrike" => 0,
          "visionScore" => 36,
          "inhibitorsLost" => 1,
          "profileIcon" => 7,
          "firstBloodAssist" => false,
          "item3" => 2003,
          "magicDamageTaken" => 4090,
          "win" => false,
          "deaths" => 8,
          "trueDamageTaken" => 635,
          "championId" => 126,
          "turretKills" => 0,
          "firstTowerAssist" => false,
          "pentaKills" => 0,
          "spell2Casts" => 57,
          "totalMinionsKilled" => 185,
          "lane" => "TOP",
          "totalDamageDealtToChampions" => 12888,
          "damageDealtToBuildings" => 3468,
          "damageDealtToObjectives" => 6799,
          "trueDamageDealt" => 5107,
          "detectorWardsPlaced" => 2,
          "killingSprees" => 0,
          "dragonKills" => 0,
          "gameEndedInEarlySurrender" => false,
          "nexusTakedowns" => 0,
          "totalTimeSpentDead" => 255,
          "spell1Casts" => 96,
          "physicalDamageDealtToChampions" => 9951,
          "item4" => 0,
          "totalDamageTaken" => 18591,
          "item5" => 3047,
          "consumablesPurchased" => 5,
          "sightWardsBoughtInGame" => 0,
          "tripleKills" => 0,
          "itemsPurchased" => 24,
          "nexusLost" => 1,
          "item1" => 3042,
          "magicDamageDealtToChampions" => 1944,
          "goldEarned" => 10784,
          "firstBloodKill" => false,
          "item2" => 6694,
          "timePlayed" => 1828,
          "magicDamageDealt" => 12419,
          "physicalDamageTaken" => 13865,
          "wardsKilled" => 2,
          "summonerId" => "RK3ByRZhdDJO2Y1i08SbLWmNDvN4WQrJk9aornKsa-xSTyE",
          "item0" => 6692,
          "longestTimeSpentLiving" => 485,
          "turretTakedowns" => 1,
          "totalHealsOnTeammates" => 0,
          "riotIdName" => "",
          "damageDealtToTurrets" => 3468,
          "summonerLevel" => 214,
          "firstTowerKill" => false,
          "item6" => 3363,
          "baronKills" => 0,
          "nexusKills" => 0,
          "summoner1Id" => 4,
          "gameEndedInSurrender" => false,
          "largestKillingSpree" => 0,
          "championName" => "Jayce",
          "teamEarlySurrendered" => false,
          "bountyLevel" => 0,
          "championTransform" => 0,
          "champLevel" => 15,
          "trueDamageDealtToChampions" => 992,
          "summoner2Id" => 12,
          "inhibitorTakedowns" => 1,
          "goldSpent" => 10750,
          "role" => "DUO",
          "turretsLost" => 7,
          "puuid" =>
            "k9sExkZBHvvAkeiJVP6embKnrDh-aWWE0pxRHZs99Q45nZgwbb22WgQL_NN0GejmOnALmE4AmZitnw",
          "largestMultiKill" => 1,
          "damageSelfMitigated" => 13258,
          "individualPosition" => "TOP",
          "wardsPlaced" => 10,
          "neutralMinionsKilled" => 18,
          "quadraKills" => 0,
          "champExperience" => 14154,
          "summonerName" => "죽습호크아이",
          "physicalDamageDealt" => 112_831,
          "doubleKills" => 0,
          "totalHeal" => 42,
          "spell3Casts" => 58,
          "perks" => %{
            "statPerks" => %{"defense" => 5002, "flex" => 5008, "offense" => 5008},
            "styles" => [
              %{
                "description" => "primaryStyle",
                "selections" => [
                  %{"perk" => 8369, "var1" => 763, "var2" => 810, "var3" => 0},
                  %{"perk" => 8304, "var1" => 12, "var2" => 0, "var3" => 0},
                  %{"perk" => 8345, "var1" => 3, "var2" => 0, "var3" => 0},
                  %{"perk" => 8347, "var1" => 0, "var2" => 0, "var3" => 0}
                ],
                "style" => 8300
              },
              %{
                "description" => "subStyle",
                "selections" => [
                  %{"perk" => 8473, "var1" => 861, "var2" => 0, "var3" => 0},
                  %{"perk" => 8451, "var1" => 176, "var2" => 0, "var3" => 0}
                ],
                "style" => 8400
              }
            ]
          },
          "objectivesStolenAssists" => 0,
          "teamPosition" => "TOP",
          "assists" => 5,
          "totalTimeCCDealt" => 107,
          "summoner2Casts" => 4,
          "summoner1Casts" => 4,
          "totalDamageDealt" => 130_358
        },
        %{
          "timeCCingOthers" => 0,
          "teamId" => 100,
          "totalUnitsHealed" => 4,
          "spell4Casts" => 278,
          "objectivesStolen" => 0,
          "kills" => 8,
          "participantId" => 2,
          "visionWardsBoughtInGame" => 1,
          "totalDamageShieldedOnTeammates" => 0,
          "unrealKills" => 0,
          "riotIdTagline" => "",
          "inhibitorKills" => 0,
          "largestCriticalStrike" => 0,
          "visionScore" => 25,
          "inhibitorsLost" => 1,
          "profileIcon" => 906,
          "firstBloodAssist" => false,
          "item3" => 3020,
          "magicDamageTaken" => 12647,
          "win" => false,
          "deaths" => 10,
          "trueDamageTaken" => 2533,
          "championId" => 76,
          "turretKills" => 0,
          "firstTowerAssist" => false,
          "pentaKills" => 0,
          "spell2Casts" => 274,
          "totalMinionsKilled" => 32,
          "lane" => "JUNGLE",
          "totalDamageDealtToChampions" => 24608,
          "damageDealtToBuildings" => 24,
          "damageDealtToObjectives" => 19710,
          "trueDamageDealt" => 11190,
          "detectorWardsPlaced" => 1,
          "killingSprees" => 2,
          "dragonKills" => 1,
          "gameEndedInEarlySurrender" => false,
          "nexusTakedowns" => 0,
          "totalTimeSpentDead" => 305,
          "spell1Casts" => 297,
          "physicalDamageDealtToChampions" => 1082,
          "item4" => 1058,
          "totalDamageTaken" => 40751,
          "item5" => 3102,
          "consumablesPurchased" => 1,
          "sightWardsBoughtInGame" => 0,
          "tripleKills" => 0,
          "itemsPurchased" => 18,
          "nexusLost" => 1,
          "item1" => 3157,
          "magicDamageDealtToChampions" => 22859,
          "goldEarned" => 14053,
          "firstBloodKill" => true,
          "item2" => 1058,
          "timePlayed" => 1828,
          "magicDamageDealt" => 144_276,
          "physicalDamageTaken" => 25570,
          "wardsKilled" => 7,
          "summonerId" => "fw2cuRpbi3_xIUKDQ_kRBMzOn18IL1f5CpRQc7fb-tc0b3f2Eu-xD1flmw",
          "item0" => 3152,
          "longestTimeSpentLiving" => 511,
          "turretTakedowns" => 1,
          "totalHealsOnTeammates" => 1648,
          "riotIdName" => "",
          "damageDealtToTurrets" => 24,
          "summonerLevel" => 70,
          "firstTowerKill" => false,
          "item6" => 3364,
          "baronKills" => 0,
          "nexusKills" => 0,
          "summoner1Id" => 4,
          "gameEndedInSurrender" => false,
          "largestKillingSpree" => 2,
          "championName" => "Nidalee",
          "teamEarlySurrendered" => false,
          "bountyLevel" => 0,
          "championTransform" => 0,
          "champLevel" => 16,
          "trueDamageDealtToChampions" => 666,
          "summoner2Id" => 11,
          "inhibitorTakedowns" => 1,
          "goldSpent" => 12625,
          "role" => "NONE",
          "turretsLost" => 7,
          "puuid" =>
            "CRzFXroIwKW8iEuI39sjp5-Y5A4zxVCrp5tFftkUcYcZ-I51lwL0tV85oxe-qWEkkNate9SO03S4yA",
          "largestMultiKill" => 2,
          "damageSelfMitigated" => 21807,
          "individualPosition" => "JUNGLE",
          "wardsPlaced" => 2,
          "neutralMinionsKilled" => 142,
          "quadraKills" => 0,
          "champExperience" => 14702,
          "summonerName" => "못먹어요",
          "physicalDamageDealt" => 13750,
          "doubleKills" => 1,
          "totalHeal" => 16164,
          "spell3Casts" => 155,
          "perks" => %{
            "statPerks" => %{"defense" => 5002, "flex" => 5008, "offense" => 5005},
            "styles" => [
              %{
                "description" => "primaryStyle",
                "selections" => [
                  %{"perk" => 8128, "var1" => 1939, "var2" => 21, "var3" => 0},
                  %{"perk" => 8143, "var1" => 820, "var2" => 0, "var3" => 0},
                  %{"perk" => 8138, "var1" => 30, "var2" => 0, "var3" => 0},
                  %{"perk" => 8134, "var1" => 44, "var2" => 5, "var3" => 0}
                ],
                "style" => 8100
              },
              %{
                "description" => "subStyle",
                "selections" => [
                  %{"perk" => 8304, "var1" => 9, "var2" => 0, "var3" => 0},
                  %{"perk" => 8321, "var1" => 3, "var2" => 0, "var3" => 0}
                ],
                "style" => 8300
              }
            ]
          },
          "objectivesStolenAssists" => 0,
          "teamPosition" => "JUNGLE",
          "assists" => 11,
          "totalTimeCCDealt" => 98,
          "summoner2Casts" => 19,
          "summoner1Casts" => 4,
          "totalDamageDealt" => 169_217
        },
        %{
          "timeCCingOthers" => 13,
          "teamId" => 100,
          "totalUnitsHealed" => 1,
          "spell4Casts" => 9,
          "objectivesStolen" => 0,
          "kills" => 12,
          "participantId" => 3,
          "visionWardsBoughtInGame" => 5,
          "totalDamageShieldedOnTeammates" => 0,
          "unrealKills" => 0,
          "riotIdTagline" => "",
          "inhibitorKills" => 0,
          "largestCriticalStrike" => 852,
          "visionScore" => 25,
          "inhibitorsLost" => 1,
          "profileIcon" => 5096,
          "firstBloodAssist" => false,
          "item3" => 3006,
          "magicDamageTaken" => 12255,
          "win" => false,
          "deaths" => 7,
          "trueDamageTaken" => 1246,
          "championId" => 23,
          "turretKills" => 4,
          "firstTowerAssist" => false,
          "pentaKills" => 0,
          "spell2Casts" => 21,
          "totalMinionsKilled" => 213,
          "lane" => "TOP",
          "totalDamageDealtToChampions" => 31205,
          "damageDealtToBuildings" => 13210,
          "damageDealtToObjectives" => 22450,
          "trueDamageDealt" => 5971,
          "detectorWardsPlaced" => 5,
          "killingSprees" => 2,
          "dragonKills" => 0,
          "gameEndedInEarlySurrender" => false,
          "nexusTakedowns" => 0,
          "totalTimeSpentDead" => 267,
          "spell1Casts" => 62,
          "physicalDamageDealtToChampions" => 28015,
          "item4" => 6675,
          "totalDamageTaken" => 39671,
          "item5" => 3123,
          "consumablesPurchased" => 7,
          "sightWardsBoughtInGame" => 0,
          "tripleKills" => 1,
          "itemsPurchased" => 29,
          "nexusLost" => 1,
          "item1" => 3036,
          "magicDamageDealtToChampions" => 2328,
          "goldEarned" => 16943,
          "firstBloodKill" => false,
          "item2" => 3031,
          "timePlayed" => 1828,
          "magicDamageDealt" => 2328,
          "physicalDamageTaken" => 26170,
          "wardsKilled" => 7,
          "summonerId" => "E8YFAx8T8FmvKco69PPKf_MjemHyOhYgZic_x0VzLr40jUppDto3ecTDVg",
          "item0" => 6671,
          "longestTimeSpentLiving" => 366,
          "turretTakedowns" => 5,
          "totalHealsOnTeammates" => 0,
          "riotIdName" => "",
          "damageDealtToTurrets" => 13210,
          "summonerLevel" => 144,
          "firstTowerKill" => false,
          "item6" => 3364,
          "baronKills" => 0,
          "nexusKills" => 0,
          "summoner1Id" => 6,
          "gameEndedInSurrender" => false,
          "largestKillingSpree" => 5,
          "championName" => "Tryndamere",
          "teamEarlySurrendered" => false,
          "bountyLevel" => 0,
          "championTransform" => 0,
          "champLevel" => 17,
          "trueDamageDealtToChampions" => 861,
          "summoner2Id" => 4,
          "inhibitorTakedowns" => 0,
          "goldSpent" => 16025,
          "role" => "DUO",
          "turretsLost" => 7,
          "puuid" =>
            "W1CZSdjFhHdZfZV83sW7QTnG2wDCSJq8JkpQAtL5b-yxMguLt9ASCNsmwuIj6t8aikXEpXw35WCo_w",
          "largestMultiKill" => 3,
          "damageSelfMitigated" => 31662,
          "individualPosition" => "MIDDLE",
          "wardsPlaced" => 8,
          "neutralMinionsKilled" => 28,
          "quadraKills" => 0,
          "champExperience" => 17856,
          "summonerName" => "DK Saint",
          "physicalDamageDealt" => 209_420,
          "doubleKills" => 2,
          "totalHeal" => 14648,
          "spell3Casts" => 154,
          "perks" => %{
            "statPerks" => %{"defense" => 5002, "flex" => 5008, "offense" => 5005},
            "styles" => [
              %{
                "description" => "primaryStyle",
                "selections" => [
                  %{"perk" => 8008, "var1" => 67, "var2" => 11, "var3" => 0},
                  %{"perk" => 9111, "var1" => 2163, "var2" => 400, "var3" => 0},
                  %{"perk" => 9104, "var1" => 13, "var2" => 30, "var3" => 0},
                  %{"perk" => 8299, "var1" => 2299, "var2" => 0, "var3" => 0}
                ],
                "style" => 8000
              },
              %{
                "description" => "subStyle",
                "selections" => [
                  %{"perk" => 8444, "var1" => 1619, "var2" => 0, "var3" => 0},
                  %{"perk" => 8242, "var1" => 133, "var2" => 0, "var3" => 0}
                ],
                "style" => 8400
              }
            ]
          },
          "objectivesStolenAssists" => 0,
          "teamPosition" => "MIDDLE",
          "assists" => 8,
          "totalTimeCCDealt" => 138,
          "summoner2Casts" => 5,
          "summoner1Casts" => 6,
          "totalDamageDealt" => 217_720
        },
        %{
          "timeCCingOthers" => 16,
          "teamId" => 100,
          "totalUnitsHealed" => 1,
          "spell4Casts" => 4,
          "objectivesStolen" => 0,
          "kills" => 5,
          "participantId" => 4,
          "visionWardsBoughtInGame" => 6,
          "totalDamageShieldedOnTeammates" => 0,
          "unrealKills" => 0,
          "riotIdTagline" => "",
          "inhibitorKills" => 1,
          "largestCriticalStrike" => 267,
          "visionScore" => 49,
          "inhibitorsLost" => 1,
          "profileIcon" => 5098,
          "firstBloodAssist" => true,
          "item3" => 3124,
          "magicDamageTaken" => 7046,
          "win" => false,
          "deaths" => 7,
          "trueDamageTaken" => 362,
          "championId" => 429,
          "turretKills" => 4,
          "firstTowerAssist" => false,
          "pentaKills" => 0,
          "spell2Casts" => 4,
          "totalMinionsKilled" => 257,
          "lane" => "BOTTOM",
          "totalDamageDealtToChampions" => 16402,
          "damageDealtToBuildings" => 7028,
          "damageDealtToObjectives" => 12518,
          "trueDamageDealt" => 1665,
          "detectorWardsPlaced" => 6,
          "killingSprees" => 1,
          "dragonKills" => 1,
          "gameEndedInEarlySurrender" => false,
          "nexusTakedowns" => 0,
          "totalTimeSpentDead" => 220,
          "spell1Casts" => 62,
          "physicalDamageDealtToChampions" => 15727,
          "item4" => 3036,
          "totalDamageTaken" => 22815,
          "item5" => 3006,
          "consumablesPurchased" => 9,
          "sightWardsBoughtInGame" => 0,
          "tripleKills" => 0,
          "itemsPurchased" => 35,
          "nexusLost" => 1,
          "item1" => 3085,
          "magicDamageDealtToChampions" => 175,
          "goldEarned" => 14257,
          "firstBloodKill" => false,
          "item2" => 1053,
          "timePlayed" => 1828,
          "magicDamageDealt" => 175,
          "physicalDamageTaken" => 15406,
          "wardsKilled" => 8,
          "summonerId" => "0TYa_tmaBd6256dpht5lJ2__DCQJpXps3u8iHUMo968wK2U",
          "item0" => 6673,
          "longestTimeSpentLiving" => 892,
          "turretTakedowns" => 5,
          "totalHealsOnTeammates" => 0,
          "riotIdName" => "",
          "damageDealtToTurrets" => 7028,
          "summonerLevel" => 500,
          "firstTowerKill" => false,
          "item6" => 3363,
          "baronKills" => 0,
          "nexusKills" => 0,
          "summoner1Id" => 3,
          "gameEndedInSurrender" => false,
          "largestKillingSpree" => 4,
          "championName" => "Kalista",
          "teamEarlySurrendered" => false,
          "bountyLevel" => 0,
          "championTransform" => 0,
          "champLevel" => 15,
          "trueDamageDealtToChampions" => 499,
          "summoner2Id" => 4,
          "inhibitorTakedowns" => 1,
          "goldSpent" => 14200,
          "role" => "CARRY",
          "turretsLost" => 7,
          "puuid" =>
            "JLNI3-xAR-4txi2OMTCNyJoKdxzFKYKO8KjxElLf_q9r22m9AQPJZv7ZujA_L9Hv3K0qxcVi66YOwg",
          "largestMultiKill" => 2,
          "damageSelfMitigated" => 11886,
          "individualPosition" => "BOTTOM",
          "wardsPlaced" => 14,
          "neutralMinionsKilled" => 30,
          "quadraKills" => 0,
          "champExperience" => 13389,
          "summonerName" => "티원 스매시",
          "physicalDamageDealt" => 191_881,
          "doubleKills" => 1,
          "totalHeal" => 648,
          "spell3Casts" => 174,
          "perks" => %{
            "statPerks" => %{"defense" => 5002, "flex" => 5008, "offense" => 5005},
            "styles" => [
              %{
                "description" => "primaryStyle",
                "selections" => [
                  %{"perk" => 9923, "var1" => 44, "var2" => 86, "var3" => 0},
                  %{"perk" => 8139, "var1" => 727, "var2" => 0, "var3" => 0},
                  %{"perk" => 8138, "var1" => 18, "var2" => 0, "var3" => 0},
                  %{"perk" => 8135, "var1" => 2362, "var2" => 5, "var3" => 0}
                ],
                "style" => 8100
              },
              %{
                "description" => "subStyle",
                "selections" => [
                  %{"perk" => 8345, "var1" => 3, "var2" => 0, "var3" => 0},
                  %{"perk" => 8347, "var1" => 0, "var2" => 0, "var3" => 0}
                ],
                "style" => 8300
              }
            ]
          },
          "objectivesStolenAssists" => 0,
          "teamPosition" => "BOTTOM",
          "assists" => 8,
          "totalTimeCCDealt" => 376,
          "summoner2Casts" => 4,
          "summoner1Casts" => 6,
          "totalDamageDealt" => 193_721
        },
        %{
          "timeCCingOthers" => 41,
          "teamId" => 100,
          "totalUnitsHealed" => 1,
          "spell4Casts" => 15,
          "objectivesStolen" => 0,
          "kills" => 10,
          "participantId" => 5,
          "visionWardsBoughtInGame" => 6,
          "totalDamageShieldedOnTeammates" => 0,
          "unrealKills" => 0,
          "riotIdTagline" => "",
          "inhibitorKills" => 0,
          "largestCriticalStrike" => 0,
          "visionScore" => 94,
          "inhibitorsLost" => 1,
          "profileIcon" => 4573,
          "firstBloodAssist" => true,
          "item3" => 3179,
          "magicDamageTaken" => 9517,
          "win" => false,
          "deaths" => 4,
          "trueDamageTaken" => 1265,
          "championId" => 555,
          "turretKills" => 0,
          "firstTowerAssist" => false,
          "pentaKills" => 0,
          "spell2Casts" => 110,
          "totalMinionsKilled" => 40,
          "lane" => "BOTTOM",
          "totalDamageDealtToChampions" => 15407,
          "damageDealtToBuildings" => 0,
          "damageDealtToObjectives" => 0,
          "trueDamageDealt" => 11902,
          "detectorWardsPlaced" => 5,
          "killingSprees" => 2,
          "dragonKills" => 0,
          "gameEndedInEarlySurrender" => false,
          "nexusTakedowns" => 0,
          "totalTimeSpentDead" => 130,
          "spell1Casts" => 72,
          "physicalDamageDealtToChampions" => 12180,
          "item4" => 3158,
          "totalDamageTaken" => 22778,
          "item5" => 3400,
          "consumablesPurchased" => 8,
          "sightWardsBoughtInGame" => 0,
          "tripleKills" => 0,
          "itemsPurchased" => 23,
          "nexusLost" => 1,
          "item1" => 3857,
          "magicDamageDealtToChampions" => 0,
          "goldEarned" => 11961,
          "firstBloodKill" => false,
          "item2" => 6693,
          "timePlayed" => 1828,
          "magicDamageDealt" => 0,
          "physicalDamageTaken" => 11995,
          "wardsKilled" => 14,
          "summonerId" => "oNmiTQCByo1WRnI2f_LrEOYCCH1M729rbgZqVF6vcKjE1amUYUMI1Tv-Uw",
          "item0" => 3026,
          "longestTimeSpentLiving" => 1228,
          "turretTakedowns" => 0,
          "totalHealsOnTeammates" => 0,
          "riotIdName" => "",
          "damageDealtToTurrets" => 0,
          "summonerLevel" => 120,
          "firstTowerKill" => false,
          "item6" => 3364,
          "baronKills" => 0,
          "nexusKills" => 0,
          "summoner1Id" => 14,
          "gameEndedInSurrender" => false,
          "largestKillingSpree" => 7,
          "championName" => "Pyke",
          "teamEarlySurrendered" => false,
          "bountyLevel" => 3,
          "championTransform" => 0,
          "champLevel" => 14,
          "trueDamageDealtToChampions" => 3227,
          "summoner2Id" => 4,
          "inhibitorTakedowns" => 0,
          "goldSpent" => 10625,
          "role" => "SUPPORT",
          "turretsLost" => 7,
          "puuid" =>
            "A0pSReTKIcBQzoNeLpzCiuusXhV_AlUQnNWElX7pe8QWtZ63s6j6y5VzWMJyOxpS72epARNm3zN1rw",
          "largestMultiKill" => 2,
          "damageSelfMitigated" => 13537,
          "individualPosition" => "UTILITY",
          "wardsPlaced" => 45,
          "neutralMinionsKilled" => 0,
          "quadraKills" => 0,
          "champExperience" => 12730,
          "summonerName" => "pingwozhijiedian",
          "physicalDamageDealt" => 21749,
          "doubleKills" => 1,
          "totalHeal" => 6022,
          "spell3Casts" => 73,
          "perks" => %{
            "statPerks" => %{"defense" => 5002, "flex" => 5008, "offense" => 5008},
            "styles" => [
              %{
                "description" => "primaryStyle",
                "selections" => [
                  %{"perk" => 9923, "var1" => 27, "var2" => 56, "var3" => 0},
                  %{"perk" => 8126, "var1" => 580, "var2" => 0, "var3" => 0},
                  %{"perk" => 8136, "var1" => 19, "var2" => 30, "var3" => 0},
                  %{"perk" => 8106, "var1" => 5, "var2" => 0, "var3" => 0}
                ],
                "style" => 8100
              },
              %{
                "description" => "subStyle",
                "selections" => [
                  %{"perk" => 8345, "var1" => 3, "var2" => 0, "var3" => 0},
                  %{"perk" => 8347, "var1" => 0, "var2" => 0, "var3" => 0}
                ],
                "style" => 8300
              }
            ]
          },
          "objectivesStolenAssists" => 0,
          "teamPosition" => "UTILITY",
          "assists" => 10,
          "totalTimeCCDealt" => 167,
          "summoner2Casts" => 5,
          "summoner1Casts" => 7,
          "totalDamageDealt" => 33652
        },
        %{
          "timeCCingOthers" => 18,
          "teamId" => 200,
          "totalUnitsHealed" => 1,
          "spell4Casts" => 10,
          "objectivesStolen" => 0,
          "kills" => 8,
          "participantId" => 6,
          "visionWardsBoughtInGame" => 2,
          "totalDamageShieldedOnTeammates" => 0,
          "unrealKills" => 0,
          "riotIdTagline" => "",
          "inhibitorKills" => 0,
          "largestCriticalStrike" => 710,
          "visionScore" => 29,
          "inhibitorsLost" => 1,
          "profileIcon" => 5212,
          "firstBloodAssist" => false,
          "item3" => 6333,
          "magicDamageTaken" => 4940,
          "win" => true,
          "deaths" => 7,
          "trueDamageTaken" => 3703,
          "championId" => 777,
          "turretKills" => 2,
          "firstTowerAssist" => false,
          "pentaKills" => 0,
          "spell2Casts" => 77,
          "totalMinionsKilled" => 245,
          "lane" => "MIDDLE",
          "totalDamageDealtToChampions" => 20521,
          "damageDealtToBuildings" => 3651,
          "damageDealtToObjectives" => 30494,
          "trueDamageDealt" => 10329,
          "detectorWardsPlaced" => 2,
          "killingSprees" => 2,
          "dragonKills" => 1,
          "gameEndedInEarlySurrender" => false,
          "nexusTakedowns" => 0,
          "totalTimeSpentDead" => 232,
          "spell1Casts" => 321,
          "physicalDamageDealtToChampions" => 14803,
          "item4" => 3006,
          "totalDamageTaken" => 30042,
          "item5" => 3026,
          "consumablesPurchased" => 3,
          "sightWardsBoughtInGame" => 0,
          "tripleKills" => 0,
          "itemsPurchased" => 26,
          "nexusLost" => 0,
          "item1" => 3143,
          "magicDamageDealtToChampions" => 3406,
          "goldEarned" => 17399,
          "firstBloodKill" => false,
          "item2" => 3031,
          "timePlayed" => 1828,
          "magicDamageDealt" => 32314,
          "physicalDamageTaken" => 21399,
          "wardsKilled" => 2,
          "summonerId" => "NEXg9wj80c8ygbKTds2qVxdpMVIytZRpWuxLjPxJB3rJKx702B-BW0ZsMQ",
          "item0" => 6673,
          "longestTimeSpentLiving" => 545,
          "turretTakedowns" => 4,
          "totalHealsOnTeammates" => 0,
          "riotIdName" => "",
          "damageDealtToTurrets" => 3651,
          "summonerLevel" => 176,
          "firstTowerKill" => true,
          "item6" => 3363,
          "baronKills" => 0,
          "nexusKills" => 0,
          "summoner1Id" => 4,
          "gameEndedInSurrender" => false,
          "largestKillingSpree" => 3,
          "championName" => "Yone",
          "teamEarlySurrendered" => false,
          "bountyLevel" => 0,
          "championTransform" => 0,
          "champLevel" => 18,
          "trueDamageDealtToChampions" => 2311,
          "summoner2Id" => 12,
          "inhibitorTakedowns" => 0,
          "goldSpent" => 17300,
          "role" => "DUO",
          "turretsLost" => 8,
          "puuid" =>
            "Kr4y3g-A2i3ygwfAfPAVhrNdwxP8S8EvzM4-Uzcpzf-hOLlaLWnVsjRjX_vsxGDo53k22fczemzjdQ",
          "largestMultiKill" => 1,
          "damageSelfMitigated" => 35471,
          "individualPosition" => "TOP",
          "wardsPlaced" => 11,
          "neutralMinionsKilled" => 48,
          "quadraKills" => 0,
          "champExperience" => 20247,
          "summonerName" => "aaassddffgg",
          "physicalDamageDealt" => 215_643,
          "doubleKills" => 0,
          "totalHeal" => 3544,
          "spell3Casts" => 59,
          "perks" => %{
            "statPerks" => %{"defense" => 5002, "flex" => 5008, "offense" => 5005},
            "styles" => [
              %{
                "description" => "primaryStyle",
                "selections" => [
                  %{"perk" => 8008, "var1" => 27, "var2" => 3, "var3" => 0},
                  %{"perk" => 9111, "var1" => 1162, "var2" => 340, "var3" => 0},
                  %{"perk" => 9104, "var1" => 14, "var2" => 10, "var3" => 0},
                  %{"perk" => 8299, "var1" => 476, "var2" => 0, "var3" => 0}
                ],
                "style" => 8000
              },
              %{
                "description" => "subStyle",
                "selections" => [
                  %{"perk" => 8473, "var1" => 950, "var2" => 0, "var3" => 0},
                  %{"perk" => 8242, "var1" => 57, "var2" => 0, "var3" => 0}
                ],
                "style" => 8400
              }
            ]
          },
          "objectivesStolenAssists" => 0,
          "teamPosition" => "TOP",
          "assists" => 9,
          "totalTimeCCDealt" => 233,
          "summoner2Casts" => 4,
          "summoner1Casts" => 4,
          "totalDamageDealt" => 258_287
        },
        %{
          "timeCCingOthers" => 34,
          "teamId" => 200,
          "totalUnitsHealed" => 1,
          "spell4Casts" => 11,
          "objectivesStolen" => 0,
          "kills" => 6,
          "participantId" => 7,
          "visionWardsBoughtInGame" => 7,
          "totalDamageShieldedOnTeammates" => 0,
          "unrealKills" => 0,
          "riotIdTagline" => "",
          "inhibitorKills" => 0,
          "largestCriticalStrike" => 19,
          "visionScore" => 33,
          "inhibitorsLost" => 1,
          "profileIcon" => 5212,
          "firstBloodAssist" => false,
          "item3" => 0,
          "magicDamageTaken" => 9552,
          "win" => true,
          "deaths" => 5,
          "trueDamageTaken" => 4192,
          "championId" => 20,
          "turretKills" => 0,
          "firstTowerAssist" => false,
          "pentaKills" => 0,
          "spell2Casts" => 86,
          "totalMinionsKilled" => 41,
          "lane" => "JUNGLE",
          "totalDamageDealtToChampions" => 12907,
          "damageDealtToBuildings" => 733,
          "damageDealtToObjectives" => 17730,
          "trueDamageDealt" => 44824,
          "detectorWardsPlaced" => 7,
          "killingSprees" => 2,
          "dragonKills" => 0,
          "gameEndedInEarlySurrender" => false,
          "nexusTakedowns" => 1,
          "totalTimeSpentDead" => 113,
          "spell1Casts" => 74,
          "physicalDamageDealtToChampions" => 1129,
          "item4" => 3068,
          "totalDamageTaken" => 30789,
          "item5" => 3047,
          "consumablesPurchased" => 7,
          "sightWardsBoughtInGame" => 0,
          "tripleKills" => 0,
          "itemsPurchased" => 28,
          "nexusLost" => 0,
          "item1" => 3075,
          "magicDamageDealtToChampions" => 11065,
          "goldEarned" => 12137,
          "firstBloodKill" => false,
          "item2" => 0,
          "timePlayed" => 1828,
          "magicDamageDealt" => 56814,
          "physicalDamageTaken" => 17043,
          "wardsKilled" => 7,
          "summonerId" => "9IH8uSUhaAsphmo2LuqkFtAaqN1nJeNczAB7IBKrlRPz__E",
          "item0" => 3143,
          "longestTimeSpentLiving" => 557,
          "turretTakedowns" => 4,
          "totalHealsOnTeammates" => 0,
          "riotIdName" => "",
          "damageDealtToTurrets" => 733,
          "summonerLevel" => 200,
          "firstTowerKill" => false,
          "item6" => 3364,
          "baronKills" => 2,
          "nexusKills" => 0,
          "summoner1Id" => 11,
          "gameEndedInSurrender" => false,
          "largestKillingSpree" => 2,
          "championName" => "Nunu",
          "teamEarlySurrendered" => false,
          "bountyLevel" => 0,
          "championTransform" => 0,
          "champLevel" => 16,
          "trueDamageDealtToChampions" => 712,
          "summoner2Id" => 4,
          "inhibitorTakedowns" => 0,
          "goldSpent" => 11375,
          "role" => "NONE",
          "turretsLost" => 8,
          "puuid" =>
            "ZgVE_MCAYUF4prmeZ3qpPwIXQrv5wr8BVrFkvPDemkUTF_gV5A8JR8paGjFvWcrOSExFcKNFJpxf9A",
          "largestMultiKill" => 1,
          "damageSelfMitigated" => 33255,
          "individualPosition" => "JUNGLE",
          "wardsPlaced" => 8,
          "neutralMinionsKilled" => 86,
          "quadraKills" => 0,
          "champExperience" => 15150,
          "summonerName" => "매판 예민한 사람",
          "physicalDamageDealt" => 12668,
          "doubleKills" => 0,
          "totalHeal" => 14221,
          "spell3Casts" => 177,
          "perks" => %{
            "statPerks" => %{"defense" => 5003, "flex" => 5008, "offense" => 5005},
            "styles" => [
              %{
                "description" => "primaryStyle",
                "selections" => [
                  %{"perk" => 8230, "var1" => 19, "var2" => 0, "var3" => 0},
                  %{"perk" => 8275, "var1" => 19, "var2" => 0, "var3" => 0},
                  %{"perk" => 8234, "var1" => 11744, "var2" => 0, "var3" => 0},
                  %{"perk" => 8232, "var1" => 5, "var2" => 30, "var3" => 0}
                ],
                "style" => 8200
              },
              %{
                "description" => "subStyle",
                "selections" => [
                  %{"perk" => 9111, "var1" => 1300, "var2" => 440, "var3" => 0},
                  %{"perk" => 9105, "var1" => 14, "var2" => 40, "var3" => 0}
                ],
                "style" => 8000
              }
            ]
          },
          "objectivesStolenAssists" => 0,
          "teamPosition" => "JUNGLE",
          "assists" => 16,
          "totalTimeCCDealt" => 296,
          "summoner2Casts" => 4,
          "summoner1Casts" => 15,
          "totalDamageDealt" => 114_306
        },
        %{
          "timeCCingOthers" => 26,
          "teamId" => 200,
          "totalUnitsHealed" => 1,
          "spell4Casts" => 12,
          "objectivesStolen" => 0,
          "kills" => 14,
          "participantId" => 8,
          "visionWardsBoughtInGame" => 8,
          "totalDamageShieldedOnTeammates" => 0,
          "unrealKills" => 0,
          "riotIdTagline" => "",
          "inhibitorKills" => 1,
          "largestCriticalStrike" => 0,
          "visionScore" => 19,
          "inhibitorsLost" => 1,
          "profileIcon" => 7,
          "firstBloodAssist" => false,
          "item3" => 3814,
          "magicDamageTaken" => 7114,
          "win" => true,
          "deaths" => 7,
          "trueDamageTaken" => 1598,
          "championId" => 246,
          "turretKills" => 3,
          "firstTowerAssist" => false,
          "pentaKills" => 0,
          "spell2Casts" => 209,
          "totalMinionsKilled" => 158,
          "lane" => "MIDDLE",
          "totalDamageDealtToChampions" => 37775,
          "damageDealtToBuildings" => 8351,
          "damageDealtToObjectives" => 20481,
          "trueDamageDealt" => 6836,
          "detectorWardsPlaced" => 7,
          "killingSprees" => 2,
          "dragonKills" => 0,
          "gameEndedInEarlySurrender" => false,
          "nexusTakedowns" => 0,
          "totalTimeSpentDead" => 174,
          "spell1Casts" => 141,
          "physicalDamageDealtToChampions" => 32950,
          "item4" => 6694,
          "totalDamageTaken" => 23344,
          "item5" => 3158,
          "consumablesPurchased" => 8,
          "sightWardsBoughtInGame" => 0,
          "tripleKills" => 1,
          "itemsPurchased" => 28,
          "nexusLost" => 0,
          "item1" => 3142,
          "magicDamageDealtToChampions" => 3251,
          "goldEarned" => 14865,
          "firstBloodKill" => false,
          "item2" => 2055,
          "timePlayed" => 1828,
          "magicDamageDealt" => 18712,
          "physicalDamageTaken" => 14631,
          "wardsKilled" => 5,
          "summonerId" => "PjoMK1yxqHLdTnOix7e8Uh0PBT8TefcWF5ide0OSnvi0KRY",
          "item0" => 6693,
          "longestTimeSpentLiving" => 652,
          "turretTakedowns" => 5,
          "totalHealsOnTeammates" => 0,
          "riotIdName" => "",
          "damageDealtToTurrets" => 8351,
          "summonerLevel" => 104,
          "firstTowerKill" => false,
          "item6" => 3364,
          "baronKills" => 0,
          "nexusKills" => 0,
          "summoner1Id" => 4,
          "gameEndedInSurrender" => false,
          "largestKillingSpree" => 10,
          "championName" => "Qiyana",
          "teamEarlySurrendered" => false,
          "bountyLevel" => 0,
          "championTransform" => 0,
          "champLevel" => 17,
          "trueDamageDealtToChampions" => 1572,
          "summoner2Id" => 14,
          "inhibitorTakedowns" => 1,
          "goldSpent" => 13900,
          "role" => "DUO",
          "turretsLost" => 8,
          "puuid" =>
            "1e6OdLUSFJ7IP_en8g6NP_f_5h543nY4ES1Gqb4IwwD8BWAJjNecccDIGw5E8p6ofyhnylOeFamCQw",
          "largestMultiKill" => 3,
          "damageSelfMitigated" => 10349,
          "individualPosition" => "MIDDLE",
          "wardsPlaced" => 9,
          "neutralMinionsKilled" => 19,
          "quadraKills" => 0,
          "champExperience" => 17144,
          "summonerName" => "Yellow",
          "physicalDamageDealt" => 145_790,
          "doubleKills" => 2,
          "totalHeal" => 1810,
          "spell3Casts" => 31,
          "perks" => %{
            "statPerks" => %{"defense" => 5002, "flex" => 5008, "offense" => 5008},
            "styles" => [
              %{
                "description" => "primaryStyle",
                "selections" => [
                  %{"perk" => 8112, "var1" => 1969, "var2" => 0, "var3" => 0},
                  %{"perk" => 8143, "var1" => 1126, "var2" => 0, "var3" => 0},
                  %{"perk" => 8138, "var1" => 18, "var2" => 0, "var3" => 0},
                  %{"perk" => 8135, "var1" => 3558, "var2" => 5, "var3" => 0}
                ],
                "style" => 8100
              },
              %{
                "description" => "subStyle",
                "selections" => [
                  %{"perk" => 8009, "var1" => 3364, "var2" => 0, "var3" => 0},
                  %{"perk" => 8299, "var1" => 1043, "var2" => 0, "var3" => 0}
                ],
                "style" => 8000
              }
            ]
          },
          "objectivesStolenAssists" => 0,
          "teamPosition" => "MIDDLE",
          "assists" => 10,
          "totalTimeCCDealt" => 82,
          "summoner2Casts" => 7,
          "summoner1Casts" => 5,
          "totalDamageDealt" => 171_340
        },
        %{
          "timeCCingOthers" => 3,
          "teamId" => 200,
          "totalUnitsHealed" => 4,
          "spell4Casts" => 8,
          "objectivesStolen" => 0,
          "kills" => 6,
          "participantId" => 9,
          "visionWardsBoughtInGame" => 0,
          "totalDamageShieldedOnTeammates" => 0,
          "unrealKills" => 0,
          "riotIdTagline" => "",
          "inhibitorKills" => 0,
          "largestCriticalStrike" => 0,
          "visionScore" => 18,
          "inhibitorsLost" => 1,
          "profileIcon" => 596,
          "firstBloodAssist" => false,
          "item3" => 3115,
          "magicDamageTaken" => 4305,
          "win" => true,
          "deaths" => 9,
          "trueDamageTaken" => 390,
          "championId" => 145,
          "turretKills" => 1,
          "firstTowerAssist" => false,
          "pentaKills" => 0,
          "spell2Casts" => 69,
          "totalMinionsKilled" => 209,
          "lane" => "BOTTOM",
          "totalDamageDealtToChampions" => 26935,
          "damageDealtToBuildings" => 2872,
          "damageDealtToObjectives" => 6573,
          "trueDamageDealt" => 3638,
          "detectorWardsPlaced" => 0,
          "killingSprees" => 1,
          "dragonKills" => 0,
          "gameEndedInEarlySurrender" => false,
          "nexusTakedowns" => 1,
          "totalTimeSpentDead" => 230,
          "spell1Casts" => 99,
          "physicalDamageDealtToChampions" => 13469,
          "item4" => 4644,
          "totalDamageTaken" => 19517,
          "item5" => 3134,
          "consumablesPurchased" => 1,
          "sightWardsBoughtInGame" => 0,
          "tripleKills" => 0,
          "itemsPurchased" => 22,
          "nexusLost" => 0,
          "item1" => 3042,
          "magicDamageDealtToChampions" => 12887,
          "goldEarned" => 13632,
          "firstBloodKill" => false,
          "item2" => 3006,
          "timePlayed" => 1828,
          "magicDamageDealt" => 33666,
          "physicalDamageTaken" => 14821,
          "wardsKilled" => 10,
          "summonerId" => "gJOiYu9ANIoAhwikEy4EgDqbf_Rv1Bzbfq3YY5ahLmpqYA",
          "item0" => 2421,
          "longestTimeSpentLiving" => 457,
          "turretTakedowns" => 3,
          "totalHealsOnTeammates" => 1020,
          "riotIdName" => "",
          "damageDealtToTurrets" => 2872,
          "summonerLevel" => 531,
          "firstTowerKill" => false,
          "item6" => 3363,
          "baronKills" => 0,
          "nexusKills" => 1,
          "summoner1Id" => 7,
          "gameEndedInSurrender" => false,
          "largestKillingSpree" => 4,
          "championName" => "Kaisa",
          "teamEarlySurrendered" => false,
          "bountyLevel" => 4,
          "championTransform" => 0,
          "champLevel" => 16,
          "trueDamageDealtToChampions" => 577,
          "summoner2Id" => 4,
          "inhibitorTakedowns" => 1,
          "goldSpent" => 11750,
          "role" => "CARRY",
          "turretsLost" => 8,
          "puuid" =>
            "dzgRkv4yPKK9_49hnjr80uUYhChCcE9_xMvcSbTMFMF4CZxw4hDU2lk_QeqyidyS1bMjKkk6JGJ4Pg",
          "largestMultiKill" => 1,
          "damageSelfMitigated" => 10759,
          "individualPosition" => "BOTTOM",
          "wardsPlaced" => 9,
          "neutralMinionsKilled" => 16,
          "quadraKills" => 0,
          "champExperience" => 15800,
          "summonerName" => "지조있게",
          "physicalDamageDealt" => 137_142,
          "doubleKills" => 0,
          "totalHeal" => 2266,
          "spell3Casts" => 165,
          "perks" => %{
            "statPerks" => %{"defense" => 5002, "flex" => 5008, "offense" => 5005},
            "styles" => [
              %{
                "description" => "primaryStyle",
                "selections" => [
                  %{"perk" => 9923, "var1" => 59, "var2" => 93, "var3" => 0},
                  %{"perk" => 8139, "var1" => 800, "var2" => 0, "var3" => 0},
                  %{"perk" => 8138, "var1" => 30, "var2" => 0, "var3" => 0},
                  %{"perk" => 8135, "var1" => 3003, "var2" => 5, "var3" => 0}
                ],
                "style" => 8100
              },
              %{
                "description" => "subStyle",
                "selections" => [
                  %{"perk" => 8304, "var1" => 10, "var2" => 3, "var3" => 0},
                  %{"perk" => 8345, "var1" => 3, "var2" => 0, "var3" => 0}
                ],
                "style" => 8300
              }
            ]
          },
          "objectivesStolenAssists" => 0,
          "teamPosition" => "BOTTOM",
          "assists" => 12,
          "totalTimeCCDealt" => 50,
          "summoner2Casts" => 5,
          "summoner1Casts" => 5,
          "totalDamageDealt" => 174_448
        },
        %{
          "timeCCingOthers" => 25,
          "teamId" => 200,
          "totalUnitsHealed" => 1,
          "spell4Casts" => 38,
          "objectivesStolen" => 0,
          "kills" => 2,
          "participantId" => 10,
          "visionWardsBoughtInGame" => 12,
          "totalDamageShieldedOnTeammates" => 3403,
          "unrealKills" => 0,
          "riotIdTagline" => "",
          "inhibitorKills" => 0,
          "largestCriticalStrike" => 0,
          "visionScore" => 69,
          "inhibitorsLost" => 1,
          "profileIcon" => 4568,
          "firstBloodAssist" => false,
          "item3" => 3067,
          "magicDamageTaken" => 4260,
          "win" => true,
          "deaths" => 8,
          "trueDamageTaken" => 1486,
          "championId" => 43,
          "turretKills" => 1,
          "firstTowerAssist" => false,
          "pentaKills" => 0,
          "spell2Casts" => 34,
          "totalMinionsKilled" => 19,
          "lane" => "BOTTOM",
          "totalDamageDealtToChampions" => 13721,
          "damageDealtToBuildings" => 894,
          "damageDealtToObjectives" => 1719,
          "trueDamageDealt" => 964,
          "detectorWardsPlaced" => 12,
          "killingSprees" => 0,
          "dragonKills" => 0,
          "gameEndedInEarlySurrender" => false,
          "nexusTakedowns" => 0,
          "totalTimeSpentDead" => 205,
          "spell1Casts" => 68,
          "physicalDamageDealtToChampions" => 730,
          "item4" => 3114,
          "totalDamageTaken" => 22248,
          "item5" => 3158,
          "consumablesPurchased" => 17,
          "sightWardsBoughtInGame" => 0,
          "tripleKills" => 0,
          "itemsPurchased" => 32,
          "nexusLost" => 0,
          "item1" => 3011,
          "magicDamageDealtToChampions" => 12122,
          "goldEarned" => 9372,
          "firstBloodKill" => false,
          "item2" => 2065,
          "timePlayed" => 1828,
          "magicDamageDealt" => 19772,
          "physicalDamageTaken" => 16501,
          "wardsKilled" => 12,
          "summonerId" => "YGlJDliPMzMMN-lqkC8qz7VK0oR9SeVj3tVoQVlWqimWasM",
          "item0" => 3853,
          "longestTimeSpentLiving" => 432,
          "turretTakedowns" => 3,
          "totalHealsOnTeammates" => 0,
          "riotIdName" => "",
          "damageDealtToTurrets" => 894,
          "summonerLevel" => 273,
          "firstTowerKill" => false,
          "item6" => 3364,
          "baronKills" => 0,
          "nexusKills" => 0,
          "summoner1Id" => 4,
          "gameEndedInSurrender" => false,
          "largestKillingSpree" => 0,
          "championName" => "Karma",
          "teamEarlySurrendered" => false,
          "bountyLevel" => 0,
          "championTransform" => 0,
          "champLevel" => 14,
          "trueDamageDealtToChampions" => 868,
          "summoner2Id" => 14,
          "inhibitorTakedowns" => 0,
          "goldSpent" => 8900,
          "role" => "SUPPORT",
          "turretsLost" => 8,
          "puuid" =>
            "tkV-xbnJqqPnXBJquyJcRkPS0eclgALr4GPIHVHi6w3mTEGv4mcb_XsxW5yVn0JAi9yHxB5ul3rFnw",
          "largestMultiKill" => 1,
          "damageSelfMitigated" => 12918,
          "individualPosition" => "UTILITY",
          "wardsPlaced" => 40,
          "neutralMinionsKilled" => 0,
          "quadraKills" => 0,
          "champExperience" => 11928,
          "summonerName" => "착해지다",
          "physicalDamageDealt" => 2836,
          "doubleKills" => 0,
          "totalHeal" => 2223,
          "spell3Casts" => 125,
          "perks" => %{
            "statPerks" => %{"defense" => 5002, "flex" => 5008, "offense" => 5008},
            "styles" => [
              %{
                "description" => "primaryStyle",
                "selections" => [
                  %{"perk" => 8229, "var1" => 1398, "var2" => 0, "var3" => 0},
                  %{"perk" => 8226, "var1" => 250, "var2" => 197, "var3" => 0},
                  %{"perk" => 8233, "var1" => 16, "var2" => 30, "var3" => 0},
                  %{"perk" => 8237, "var1" => 516, "var2" => 0, "var3" => 0}
                ],
                "style" => 8200
              },
              %{
                "description" => "subStyle",
                "selections" => [
                  %{"perk" => 8345, "var1" => 3, "var2" => 0, "var3" => 0},
                  %{"perk" => 8352, "var1" => 90, "var2" => 459, "var3" => 25}
                ],
                "style" => 8300
              }
            ]
          },
          "objectivesStolenAssists" => 0,
          "teamPosition" => "UTILITY",
          "assists" => 21,
          "totalTimeCCDealt" => 146,
          "summoner2Casts" => 7,
          "summoner1Casts" => 4,
          "totalDamageDealt" => 23574
        }
      ],
      "platformId" => "KR",
      "queueId" => 420,
      "teams" => [
        %{
          "bans" => [
            %{"championId" => 101, "pickTurn" => 1},
            %{"championId" => -1, "pickTurn" => 2},
            %{"championId" => 7, "pickTurn" => 3},
            %{"championId" => 39, "pickTurn" => 4},
            %{"championId" => 51, "pickTurn" => 5}
          ],
          "objectives" => %{
            "baron" => %{"first" => false, "kills" => 0},
            "champion" => %{"first" => true, "kills" => 36},
            "dragon" => %{"first" => true, "kills" => 2},
            "inhibitor" => %{"first" => true, "kills" => 1},
            "riftHerald" => %{"first" => false, "kills" => 1},
            "tower" => %{"first" => false, "kills" => 8}
          },
          "teamId" => 100,
          "win" => false
        },
        %{
          "bans" => [
            %{"championId" => 24, "pickTurn" => 6},
            %{"championId" => 412, "pickTurn" => 7},
            %{"championId" => 64, "pickTurn" => 8},
            %{"championId" => 51, "pickTurn" => 9},
            %{"championId" => 7, "pickTurn" => 10}
          ],
          "objectives" => %{
            "baron" => %{"first" => true, "kills" => 2},
            "champion" => %{"first" => false, "kills" => 36},
            "dragon" => %{"first" => false, "kills" => 1},
            "inhibitor" => %{"first" => false, "kills" => 1},
            "riftHerald" => %{"first" => true, "kills" => 1},
            "tower" => %{"first" => true, "kills" => 7}
          },
          "teamId" => 200,
          "win" => true
        }
      ],
      "tournamentCode" => ""
    },
    "metadata" => %{
      "dataVersion" => "2",
      "matchId" => "KR_5685774969",
      "participants" => [
        "k9sExkZBHvvAkeiJVP6embKnrDh-aWWE0pxRHZs99Q45nZgwbb22WgQL_NN0GejmOnALmE4AmZitnw",
        "CRzFXroIwKW8iEuI39sjp5-Y5A4zxVCrp5tFftkUcYcZ-I51lwL0tV85oxe-qWEkkNate9SO03S4yA",
        "W1CZSdjFhHdZfZV83sW7QTnG2wDCSJq8JkpQAtL5b-yxMguLt9ASCNsmwuIj6t8aikXEpXw35WCo_w",
        "JLNI3-xAR-4txi2OMTCNyJoKdxzFKYKO8KjxElLf_q9r22m9AQPJZv7ZujA_L9Hv3K0qxcVi66YOwg",
        "A0pSReTKIcBQzoNeLpzCiuusXhV_AlUQnNWElX7pe8QWtZ63s6j6y5VzWMJyOxpS72epARNm3zN1rw",
        "Kr4y3g-A2i3ygwfAfPAVhrNdwxP8S8EvzM4-Uzcpzf-hOLlaLWnVsjRjX_vsxGDo53k22fczemzjdQ",
        "ZgVE_MCAYUF4prmeZ3qpPwIXQrv5wr8BVrFkvPDemkUTF_gV5A8JR8paGjFvWcrOSExFcKNFJpxf9A",
        "1e6OdLUSFJ7IP_en8g6NP_f_5h543nY4ES1Gqb4IwwD8BWAJjNecccDIGw5E8p6ofyhnylOeFamCQw",
        "dzgRkv4yPKK9_49hnjr80uUYhChCcE9_xMvcSbTMFMF4CZxw4hDU2lk_QeqyidyS1bMjKkk6JGJ4Pg",
        "tkV-xbnJqqPnXBJquyJcRkPS0eclgALr4GPIHVHi6w3mTEGv4mcb_XsxW5yVn0JAi9yHxB5ul3rFnw"
      ]
    }
  }

  @summoners_list [
    %{
      "accountId" => "0-k1O0Hnn9-X-GTaXe0ZpRwLPyDmD9skiGcqa-dpBC_XHCjg2PmQBxIV",
      "id" => "YGlJDliPMzMMN-lqkC8qz7VK0oR9SeVj3tVoQVlWqimWasM",
      "name" => "블루베리맛있어",
      "profileIconId" => 23,
      "puuid" => "tkV-xbnJqqPnXBJquyJcRkPS0eclgALr4GPIHVHi6w3mTEGv4mcb_XsxW5yVn0JAi9yHxB5ul3rFnw",
      "revisionDate" => 1_657_627_686_000,
      "summonerLevel" => 341
    },
    %{
      "accountId" => "zN5TZkPG-MkrAMAlZQSa-SNGOhkwyghfWFhY075zUrse",
      "id" => "gJOiYu9ANIoAhwikEy4EgDqbf_Rv1Bzbfq3YY5ahLmpqYA",
      "name" => "지조있게",
      "profileIconId" => 596,
      "puuid" => "dzgRkv4yPKK9_49hnjr80uUYhChCcE9_xMvcSbTMFMF4CZxw4hDU2lk_QeqyidyS1bMjKkk6JGJ4Pg",
      "revisionDate" => 1_663_261_669_000,
      "summonerLevel" => 656
    },
    %{
      "accountId" => "6jQxeIlBUExhgOUGXfWFyf_TkIizpZJJ1c5Ml6RcEPT-wBCZYxee9hv-",
      "id" => "PjoMK1yxqHLdTnOix7e8Uh0PBT8TefcWF5ide0OSnvi0KRY",
      "name" => "YAMANGZZ",
      "profileIconId" => 7,
      "puuid" => "1e6OdLUSFJ7IP_en8g6NP_f_5h543nY4ES1Gqb4IwwD8BWAJjNecccDIGw5E8p6ofyhnylOeFamCQw",
      "revisionDate" => 1_663_350_799_000,
      "summonerLevel" => 158
    },
    %{
      "accountId" => "DVoDOGfSHgZFyuor4xE2yOtBHsdCEvkagJxaWFpC7vgu6zw",
      "id" => "9IH8uSUhaAsphmo2LuqkFtAaqN1nJeNczAB7IBKrlRPz__E",
      "name" => "milinjinbingwan",
      "profileIconId" => 3785,
      "puuid" => "ZgVE_MCAYUF4prmeZ3qpPwIXQrv5wr8BVrFkvPDemkUTF_gV5A8JR8paGjFvWcrOSExFcKNFJpxf9A",
      "revisionDate" => 1_663_378_888_225,
      "summonerLevel" => 229
    },
    %{
      "accountId" => "_-m7Gyn4QupEILCjIt7KAMXBv5AhpPOzkWf9LuIehDILnvGy01qYgAKc",
      "id" => "NEXg9wj80c8ygbKTds2qVxdpMVIytZRpWuxLjPxJB3rJKx702B-BW0ZsMQ",
      "name" => "2639439711897152",
      "profileIconId" => 5212,
      "puuid" => "Kr4y3g-A2i3ygwfAfPAVhrNdwxP8S8EvzM4-Uzcpzf-hOLlaLWnVsjRjX_vsxGDo53k22fczemzjdQ",
      "revisionDate" => 1_642_137_289_000,
      "summonerLevel" => 177
    },
    %{
      "accountId" => "iT_-GNp_wFQW3TOqnbUXg4ooDRM0HUmNHhb6kL66XemPZG0PBXak0_va",
      "id" => "oNmiTQCByo1WRnI2f_LrEOYCCH1M729rbgZqVF6vcKjE1amUYUMI1Tv-Uw",
      "name" => "Jian Yi Bu Dao",
      "profileIconId" => 5270,
      "puuid" => "A0pSReTKIcBQzoNeLpzCiuusXhV_AlUQnNWElX7pe8QWtZ63s6j6y5VzWMJyOxpS72epARNm3zN1rw",
      "revisionDate" => 1_650_272_947_000,
      "summonerLevel" => 159
    },
    %{
      "accountId" => "i4fSM8j2C-oyaUKlFBeHZ4p9EKVEM-3fli1m9_QtIQMdbX8",
      "id" => "0TYa_tmaBd6256dpht5lJ2__DCQJpXps3u8iHUMo968wK2U",
      "name" => "티원 스매시",
      "profileIconId" => 5098,
      "puuid" => "JLNI3-xAR-4txi2OMTCNyJoKdxzFKYKO8KjxElLf_q9r22m9AQPJZv7ZujA_L9Hv3K0qxcVi66YOwg",
      "revisionDate" => 1_650_212_494_000,
      "summonerLevel" => 509
    },
    %{
      "accountId" => "8zXX2e6EI4Tv9bIrSX97eD0EZ3-TODxqVXlo5Hb6dRf1Qy-yuw9z1WKw",
      "id" => "E8YFAx8T8FmvKco69PPKf_MjemHyOhYgZic_x0VzLr40jUppDto3ecTDVg",
      "name" => "담원기아 세인트",
      "profileIconId" => 5096,
      "puuid" => "W1CZSdjFhHdZfZV83sW7QTnG2wDCSJq8JkpQAtL5b-yxMguLt9ASCNsmwuIj6t8aikXEpXw35WCo_w",
      "revisionDate" => 1_663_484_963_092,
      "summonerLevel" => 282
    },
    %{
      "accountId" => "Fl6mt8g0W7FPu2jd5CISqojpi7hKU_EK_PU_MVgTzt8Lxbk_nvREDUqa",
      "id" => "fw2cuRpbi3_xIUKDQ_kRBMzOn18IL1f5CpRQc7fb-tc0b3f2Eu-xD1flmw",
      "name" => "못먹어요",
      "profileIconId" => 3366,
      "puuid" => "CRzFXroIwKW8iEuI39sjp5-Y5A4zxVCrp5tFftkUcYcZ-I51lwL0tV85oxe-qWEkkNate9SO03S4yA",
      "revisionDate" => 1_650_000_714_000,
      "summonerLevel" => 72
    },
    %{
      "accountId" => "aF1STDX2DE6w_qeJuPkPngGRl4huNxcQeAMo77ws-0JT8MM",
      "id" => "RK3ByRZhdDJO2Y1i08SbLWmNDvN4WQrJk9aornKsa-xSTyE",
      "name" => "펄스나인원딜",
      "profileIconId" => 7,
      "puuid" => "k9sExkZBHvvAkeiJVP6embKnrDh-aWWE0pxRHZs99Q45nZgwbb22WgQL_NN0GejmOnALmE4AmZitnw",
      "revisionDate" => 1_663_358_966_000,
      "summonerLevel" => 345
    }
  ]

  def get do
    %{
      platform_id: @platform_id,
      game_data: @game_data,
      summoners_list: @summoners_list
    }
  end
end
{{< /code >}}

Add this to our existing `test/support/fixtures/games_fixtures.ex`

```elixir
defmodule ProbuildEx.GamesFixtures do
  ...
  @doc """
  Generate a unique attrs for game.
  """
  def unique_game_attrs(attrs \\ %{}) do
    Enum.into(
      attrs,
      %{
        "creation_int" => DateTime.now!("Etc/UTC") |> DateTime.to_unix(:millisecond),
        "duration" => 1600,
        "platform_id" => "euw1",
        "riot_id" => "EUW1_#{System.unique_integer([:positive])}",
        "version" => "12.1.1",
        "winner" => 100
      }
    )
  end

  @doc """
  Generate a game.
  """
  def game_fixture(attrs \\ %{}) do
    attrs = unique_game_attrs(attrs)

    {:ok, game} = ProbuildEx.Repo.insert(attrs)
    game
  end
end
```

Edit `test/probuild_ex/games_test.exs`
```elixir
defmodule ProbuildEx.GamesTest do
  use ExUnit.Case, async: true
  use ProbuildEx.DataCase

  import ProbuildEx.GamesFixtures

  alias ProbuildEx.GameDataFixtures
  alias ProbuildEx.Games

  ...

  describe "summoner" do
    ...
    test "list_pro_summoners/1 should filter properly per region and pro" do
      summoner_fixture(%{"platform_id" => "kr"})
      summoner_fixture(%{"platform_id" => "euw1"})
      summoner_fixture(%{"pro_id" => nil, "platform_id" => "kr"})

      assert [_pro_kr_summoner] = Games.list_pro_summoners("kr")
    end
  end

  describe "game" do
    test "Games.Game.changeset/2 should clean version" do
      attrs = unique_game_attrs(%{"version" => "12.1.416.4011"})

      assert {:ok, game} =
               %Games.Game{}
               |> Games.Game.changeset(attrs)
               |> apply_action(:insert)

      assert game.version == "12.1.1"
    end

    test "Games.Game.changeset/2 should cast creation_int unix timestamp to utc_datetime creation" do
      attrs = unique_game_attrs(%{"creation_int" => 1_663_531_903_769})

      assert {:ok, game} =
               %Games.Game{}
               |> Games.Game.changeset(attrs)
               |> apply_action(:insert)

      assert game.creation == ~U[2022-09-18 20:11:43Z]
    end

    test "create_game_complete/3 should create a game, 10 summoners and 10 participants" do
      data = GameDataFixtures.get()

      assert {:ok, multi} =
               Games.create_game_complete(
                 data.platform_id,
                 data.game_data,
                 data.summoners_list
               )

      assert %Games.Game{} = multi[:game]

      created_summoners =
        for {{:summoner, _puuid}, summoner} <- multi do
          assert %Games.Summoner{} = summoner
        end

      assert Enum.count(created_summoners) == 10

      created_participants =
        for {{:participant, _team_role}, participant} <- multi do
          assert %Games.Participant{} = participant
        end

      assert Enum.count(created_participants) == 10
    end
  end
end
```

We added a test for `list_pro_summoners/1` make sure it behave properly.

We added tests for the `game` schema and `Game.changeset/2` about the `version` and `creation_int` that we discussed earlier.

Last we test our `create_game_complete/3`. We pass it the real data fixture we setup erlier in `GameDataFixtures`.
We check the returned `Multi`  we should get a `Game`, 10 `summoner` and 10 `participants`.


### Canon Games

With our `Games` context ready it's time to write `Canon.Games`.

Create a new file `lib/probuild_ex/canon/games`
```elixir
defmodule ProbuildEx.Canon.Games do
  @moduledoc """
  The Games Canon pipeline.

  All the call to RiotApi happens here.

  Step:
  - Query our database for pro summoner of the selected platform_id.
  - Request RiotApi for the match_ids of the pro summoner.
  - Filter match_ids that already exist in our database.
  - Request RiotApi for the pro summoner match_ids.
  - Request RiotApi for the data of the match_id.
  - Request our database or RiotApi for the summoners.
  - Create Game with participants and summoners in our database.
  """

  alias ProbuildEx.{
    Games,
    RiotApi
  }

  require Logger

  def run(platform_id \\ "euw1") do
    region_client = RiotApi.new(platform_id, :convert_platform_to_region_id)
    platform_client = RiotApi.new(platform_id)

    platform_id
    |> Games.list_pro_summoners()
    |> Stream.map(fn summoner ->
      RiotApi.list_matches(region_client, summoner.puuid)
    end)
    |> Stream.flat_map(&Games.reject_existing_games/1)
    |> Stream.map(fn riot_id ->
      with {:ok, match_data} <- RiotApi.fetch_match(region_client, riot_id),
           {:ok, summoners_list} <- fetch_summoners(platform_id, platform_client, match_data) do
        {match_data, summoners_list}
      end
    end)
    |> Stream.reject(fn
      {:error, _} -> true
      {_match_data, _summoners_list} -> false
    end)
    |> Stream.map(fn {match_data, summoners_list} ->
      platform_id
      |> Games.create_game_complete(match_data, summoners_list)
      |> log_failed_transaction()
    end)
    |> Stream.run()
  end

  defp fetch_summoners(platform_id, platform_client, match_data) do
    puuids_list = get_in(match_data, ["metadata", "participants"])

    summoners_list =
      Enum.reduce_while(puuids_list, [], fn puuid, acc ->
        with {:error, :not_found} <- Games.fetch_summoner(puuid: puuid, platform_id: platform_id),
             {:ok, summoner_data} <- RiotApi.fetch_summoner_by_puuid(platform_client, puuid) do
          {:cont, [summoner_data | acc]}
        else
          {:ok, summoner} ->
            {:cont, [summoner | acc]}

          # We did not find the summoner in the RiotApi stop fetching summoners return empty list
          {:error, :not_found} ->
            {:halt, []}
        end
      end)

    case summoners_list do
      [] ->
        {:error, :summoner_puuid_not_found}

      summoners_list ->
        {:ok, summoners_list}
    end
  end

  defp log_failed_transaction(result) do
    case result do
      {:ok, _} ->
        :ok

      # Game with missing attributes version or winner
      {:error, :game, %{errors: _}, _any} ->
        :ok

      # Game with summoners missing their team_position
      {:error, {:participant, _}, %{errors: [{:team_position, _}]}, _any} ->
        :ok

      {:error, any} ->
        Logger.error(any)

      {:error, multi_name, changeset, multi} ->
        Logger.error("""
          multi_name:
          #{inspect(multi_name)}
          changeset:
          #{inspect(changeset)}
          multi:
          #{inspect(multi)}
        """)
    end
  end
end
```

Like for `Canon.Pros` we are using [Stream](https://hexdocs.pm/elixir/Stream.html) again and make a nice pipeline.

We start by creating two riot clients for v4 endpoints and v5 endpoints refer to [part one](/posts/probuild-ex-part-one/#fetch-riot-data-from-their-api---commithttpsgithubcommrdotbprobuild_excommit415040b60d6d304ade88ddb0309554f90fa62c0d) if you forget why we need two clients.

We list the pro summoners on our database then sequentially:
- List his matches on the riot api
- Reject the matches that already exist in our database
- Flatten the result then iterate over the match_id
- Try to fetch the match on riot api two cases:
  - Could not find match go to next match
  - Find match try to fetch the summoners on database or riot api two cases: 
    - Could not find one of the summoners on riot api go to next match
    - Success we find the 10 summoners
- Try to create the `match`, `summoners`, `participants`

Let's run our `Canon.Games` in `iex -S mix` and start collecting games. You can put one of the `platflorm_id` from list `["euw1", "jp1", "kr", "na1", "br1"]`. *You need to have some pro summoners in database by running the `Canon.Pros` like we did before*
```elixir
ProbuildEx.Canon.Games.run("kr")
```

Now you should see a mix of HTTP log from tesla and sql query and insert. At some point you should get rate limited. The tesla retry middleware that we setup in part one will kick in and retry when the limit end.

And that's all for `Canon.Games`! It will take some time to complete depending on the region you choose. But since we do everything in transaction it's safe to kill it anytime and restart it later!

## Canon Cron - [commit](https://github.com/mrdotb/probuild_ex/commit/a2c0c72ff40f82d184d7692019ec9d8c7e16fd9d)

Now we have our `Canon.Pros` and `Canon.Games` we want them to be run in a cron fashion. Every 24 hours for `Pros` and in a loop for `Games`. We want to run `Canon.Pros` and `Canon.Games` per each `platform_id`.

We will use a [GenServer](https://hexdocs.pm/elixir/1.12/GenServer.html).

*A GenServer is a process like any other Elixir process and it can be used to keep state, execute code asynchronously and so on.*

```elixir
defmodule ProbuildEx.Canon.Cron do
  @moduledoc """
  Will run our Module Fun Args in a Cron fashion
  """
  use GenServer, restart: :transient

  require Logger

  def start_link({delay, mfa}) do
    GenServer.start_link(__MODULE__, {delay, mfa, 0})
  end

  @impl true
  def init(args) do
    {:ok, args, {:continue, :schedule_next_run}}
  end

  @impl true
  def handle_continue(:schedule_next_run, {delay, mfa, 0}) do
    send(self(), :perform_work)
    {:noreply, {delay, mfa, 0}}
  end

  def handle_continue(:schedule_next_run, {delay, mfa, num}) do
    Process.send_after(self(), :perform_work, delay)
    {:noreply, {delay, mfa, num}}
  end

  @impl true
  def handle_info(:perform_work, {delay, {module, fun, args} = mfa, num}) do
    Logger.info("Canon #{module} #{args} num #{num} started")

    {time, _result} =
      :timer.tc(fn ->
        apply(module, fun, args)
      end)

    Logger.info("Canon #{module} #{args} num #{num} finished in #{to_milli(time)} ms")

    {:noreply, {delay, mfa, num + 1}, {:continue, :schedule_next_run}}
  end

  defp to_milli(microsecond) do
    System.convert_time_unit(microsecond, :microsecond, :millisecond)
  end
end
```

Let's go slowly. First, we make use of the `restart: :transient` option to be able to stop our GenServer under `:normal` condition.

Let's break what happens:
- `start_link/1` function receive the `delay` which is how many millisecond should we wait before running the next canon and mfa which stands for Module Function Args ex: `{ProbuildEx.Canon.Pros, :run, ["kr"]}`. The third argument is the current number of completed canon it start at `0`.
- `init/1` is triggered by `start_link` it receive the args from it `{delay, mfa, num}` at the end it send a `:schedule_next_run`
- `handle_continue/2` `:schedule_next_run` is triggered two cases:
  - it's the first run `num == 0` in this case we run `perform_work` without waiting the delay
  - it's not the first run `num != 0` in this case we run `perform_work` after waiting the delay
- `handle_info/2` `:perform_work` is triggered:
  - Log the args
  - Run the mfa
  - Report the number of time it took to complete using the erlang [`:timer.tc/1`](https://www.erldocs.com/current/stdlib/timer.html?i=0&search=timer.tc#tc/1) function
  - Send a `:schedule_next_run`

Let's run `Canon.Pros` through `Canon.Cron` in `iex -S mix` with 5 seconds delay.
```elixir
{:ok, pid} = ProbuildEx.Canon.Cron.start_link({5_000, {ProbuildEx.Canon.Pros, :run, ["kr"]}})
...
[info] Canon Elixir.ProbuildEx.Canon.Pros kr num 0 finished in 365 ms
...
[info] Canon Elixir.ProbuildEx.Canon.Pros kr num 1 finished in 190 ms
```
Since I run run `Canon.Pros` on `"kr"` previously it complete fast, then wait 5 seconds before running it again and again.

## Supervisor and application configs - [commit](https://github.com/mrdotb/probuild_ex/commit/9f3016f5992de0ad3bd8d90636f1d8ff25fd8508)

Now that we can run our `Canon` infinitely we want all our Canon to be created when we start the application and be automatically restarted in case of unknow errors.

Perfect in elixir we have [`Supervisor`](https://hexdocs.pm/elixir/1.12/Supervisor.html) a behaviour for a proces that supervises other processes and can restart them when they crash.

First we will setup a config for our `Canons`.

Edit `config/config.exs`
```elixir
config :probuild_ex, :canon,
  games: [platform_ids: ["euw1", "jp1", "kr", "na1", "br1"], delay: 10_000],
  pros: [platform_ids: ["euw1", "jp1", "kr", "na1", "br1"], delay: 1_000 * 60 * 60 * 24]
```

We will run 5 `Canon.Games` waiting 10 seconds between completion and 5 `Canon.Pros` waiting 24 hours between completion.

Edit `config/test.exs`
```elixir
# Disable canon during tests
config :probuild_ex, :canon,
  games: [platform_ids: []],
  pros: [platform_ids: []]
```

We don't want to run the canons during the tests.

Create file `lib/probuild_ex/canon/supervisor.ex`
```elixir
defmodule ProbuildEx.Canon.Supervisor do
  @moduledoc false

  use Supervisor

  def start_link(_) do
    Supervisor.start_link(__MODULE__, [], name: __MODULE__)
  end

  @impl true
  def init(_) do
    config = Application.get_env(:probuild_ex, :canon)
    games = config[:games]
    pros = config[:pros]

    canon_games =
      for platform_id <- games[:platform_ids] do
        Supervisor.child_spec(
          {ProbuildEx.Canon.Cron, {games[:delay], {ProbuildEx.Canon.Games, :run, [platform_id]}}},
          id: String.to_atom("game_" <> platform_id)
        )
      end

    canon_pros =
      for platform_id <- pros[:platform_ids] do
        Supervisor.child_spec(
          {ProbuildEx.Canon.Cron, {pros[:delay], {ProbuildEx.Canon.Pros, :run, [platform_id]}}},
          id: String.to_atom("pro_" <> platform_id)
        )
      end

    children = canon_games ++ canon_pros

    Supervisor.init(children, strategy: :one_for_one)
  end
end
```

We created our Canon supervisor it will get info from the config we did before and prepare a list of children filled with our `Canon.Cron` configured to run our `Games` and `Pros` canons.  The children list will be something like that.
```elixir
[
  %{
    id: :game_euw1,
    restart: :transient,
    start: {ProbuildEx.Canon.Cron, :start_link,
     [{10000, {ProbuildEx.Canon.Games, :run, ["euw1"]}}]}
  },
  %{
    id: :game_jp1,
    restart: :transient,
    start: {ProbuildEx.Canon.Cron, :start_link,
     [{10000, {ProbuildEx.Canon.Games, :run, ["jp1"]}}]}
  },
  ...
  %{
    id: :pro_euw1,
    restart: :transient,
    start: {ProbuildEx.Canon.Cron, :start_link,
     [{86400000, {ProbuildEx.Canon.Pros, :run, ["euw1"]}}]}
  },
  %{
    id: :pro_jp1,
    restart: :transient,
    start: {ProbuildEx.Canon.Cron, :start_link,
     [{86400000, {ProbuildEx.Canon.Pros, :run, ["jp1"]}}]}
  },
  ...
]
```

The strategy used is `:one_for_one` which mean it will replace the canon that errored by another one with the same config.

Now we want our supervisor be started when we launch the application.

Edit `lib/probuild_ex/application.ex`
```elixir
defmodule ProbuildEx.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      # Start the Ecto repository
      ProbuildEx.Repo,
      # Start the Telemetry supervisor
      ProbuildExWeb.Telemetry,
      # Start the PubSub system
      {Phoenix.PubSub, name: ProbuildEx.PubSub},
      # Start the Endpoint (http/https)
      ProbuildExWeb.Endpoint
      # Start a worker by calling: ProbuildEx.Worker.start_link(arg)
      # {ProbuildEx.Worker, arg}
      ProbuildExWeb.Endpoint,
      # Canon Supervisor
      ProbuildEx.Canon.Supervisor
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: ProbuildEx.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    ProbuildExWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
```

In the children list we added our `Canon.Supervisor`.

Now run `iex -S mix` you should see so much logs from http and sql logs that you can't see anything it's just too fast.
Let's kill that and disable some logs using our local dev config.

Edit `config/dev.local.exs`
```elixir
# since tesla and ecto_sql are deps don't forget to recompile them if you want to turn on / off their logs
# mix deps.compile --force tesla ecto_sql 
config :logger,
  backends: [:console],
  compile_time_purge_matching: [
    [application: :ecto_sql],
    [application: :tesla],
    [module: ProbuildEx.Canon.Games]
  ]
```

Using the `:compile_time_purge_matching` we disable the sql and http logs and the logs and also the log from the `Canon.Games` module this way we will see our others logs better.
Because `tesla` and `ecto_sql` are deps we need to recompile them turn on / off their logs.
```elixir
mix deps.compile --force tesla ecto_sql 
```

Now let's run our app again
```elixir
iex -S mix
Generated probuild_ex app
[info] Canon Elixir.ProbuildEx.Canon.Games euw1 num 0 started
[info] Canon Elixir.ProbuildEx.Canon.Games jp1 num 0 started
[info] Canon Elixir.ProbuildEx.Canon.Games kr num 0 started
[info] Canon Elixir.ProbuildEx.Canon.Games na1 num 0 started
[info] Canon Elixir.ProbuildEx.Canon.Games br1 num 0 started
[info] Canon Elixir.ProbuildEx.Canon.Pros euw1 num 0 started
[info] Canon Elixir.ProbuildEx.Canon.Pros kr num 0 started
[info] Canon Elixir.ProbuildEx.Canon.Pros jp1 num 0 started
[info] Canon Elixir.ProbuildEx.Canon.Pros na1 num 0 started
[info] Canon Elixir.ProbuildEx.Canon.Pros br1 num 0 started
[info] Canon Elixir.ProbuildEx.Canon.Pros jp1 num 0 finished in 265 ms
[info] Canon Elixir.ProbuildEx.Canon.Pros br1 num 0 finished in 285 ms
[info] Canon Elixir.ProbuildEx.Canon.Pros na1 num 0 finished in 332 ms
[info] Canon Elixir.ProbuildEx.Canon.Pros kr num 0 finished in 451 ms
...
```

Easy to read as you can see the `Canon.Pros` complete very fast since I run them before the UGG endpoint have only small updates so running them every 24 hours is good enough.

The first `Canon.Games` will take a lot of time to complete and it will get faster when we start to get a lot of summoners. Pro players play at high level and at this level it's often the same players.

Last thing let's ensure it restart by killing a random `Canon` in `iex -S mix` and check if the PID change
```elixir
Supervisor.which_children(ProbuildEx.Canon.Supervisor)
[
  {:pro_br1, #PID<0.617.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:pro_na1, #PID<0.616.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:pro_kr, #PID<0.615.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:pro_jp1, #PID<0.614.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:pro_euw1, #PID<0.613.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:game_br1, #PID<0.612.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:game_na1, #PID<0.702.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:game_kr, #PID<0.610.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:game_jp1, #PID<0.609.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:game_euw1, #PID<0.608.0>, :worker, [ProbuildEx.Canon.Cron]}
]

Supervisor.which_children(ProbuildEx.Canon.Supervisor) |> Enum.random() |> elem(1) |> Process.exit(:kill)
Supervisor.which_children(ProbuildEx.Canon.Supervisor)
[
  {:pro_br1, #PID<0.617.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:pro_na1, #PID<0.616.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:pro_kr, #PID<0.615.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:pro_jp1, #PID<0.614.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:pro_euw1, #PID<0.613.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:game_br1, #PID<0.612.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:game_na1, #PID<0.702.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:game_kr, #PID<0.753.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:game_jp1, #PID<0.609.0>, :worker, [ProbuildEx.Canon.Cron]},
  {:game_euw1, #PID<0.608.0>, :worker, [ProbuildEx.Canon.Cron]}
]
```

We use `Supervisor.which_children/1` to get the list of children. We then pick a random children PID and `:exit` the process. The unlucky process was `:game_kr` it get restarted right away by the supervisor with a new PID.

## Closing thoughts

Well done and thanks for sticking with me to the end! This is probably the longest and most challenging part in the series, especially if you are new to elixir.

We covered a lot of things that you can do with elixir and ecto:
- Transactions through `Ecto.Multi` and `Repo.transaction`
- `Stream` to build a sequential pipeline
- `GenServer` to run jobs infinitely 
- `Supervisor` to ensure our process get restarted if an unknow error happen

In the next part we will begin the creation of a styled dashboard with liveview to display our data.

Be sure to sign up to the newsletter so that you won't miss the next Part. Feel free to leave comments or feedback. I also appreciate if you can star ⭐ the companion code [repo](https://github.com/mrdotb/probuild_ex).

See you soon !
{{< newsletter >}}
