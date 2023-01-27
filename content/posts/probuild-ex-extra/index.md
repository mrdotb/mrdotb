+++
title = 'Probuild Ex Extra'
date = '2022-12-31T13:31:13.003944Z'
author = 'mrdotb'
description = ''
tags = ['elixir', 'phoenix', 'ecto', 'tutorial', 'pagination', 'postgres']
toc = true
showReadingTime = true
+++

## Intro

Probuild Ex is still up and running. After three monthes the database grew to 1500 MB. The query started were really slow, the front was unresponsive. I did some digging and made it fast again. I feel like it was an interesting to share my journey.

*A league of legend probuilds provide easy access league of legends to Pro players builds accross regions ex: ([probuilds.net](https://www.probuilds.net/), [probuildstats.com](https://probuildstats.com/))*


## Have a peak 👀 at Probuild Ex
https://probuild.fly.dev/

If you miss the series and you can start on [Part one](/posts/probuild-ex-part-one/).
**It's a phoenix 1.6 app with liveview 0.17. I plan to upgrade the serie when phoenix 1.7 is released. Subscribe to the newsletter to get informed.**

{{< newsletter >}}

## Unresponsive front

The query is really slow.

video of unresponsive front


## Finding and fixing the slow query

### The `pg_stats` extension

pg_stat is a extension that do ...

### Activating the `pg_stats` extension

Let's create a new migration.

```elixir
mix ecto.gen.migration create_extension_pg_stats
```

Then edit the migration `migrations/XXXXXXXXXX_create_extension_pg_stats.exs`

```elixir
def change do
  execute """
  CREATE EXTENSION IF NOT EXISTS "pg_stats";
  """
end
```

### Extra config on fly.io

On [fly.io](https://fly.io/) we need those extra step.
```
fly postgres config update -a probuild-db --shared-preload-libraries pg_stat_statements
fly restart -a probuild-db
```

### Run the migration
```elixir
mix ecto.migrate
```

### Query our queries
I took this query from the video of name of the guy.

At this point I open psql to run some sql query directly but it also possible to do that with ecto.

```sql
SELECT query,
    round(total_exec_time::numeric, 2) AS total_time,
    calls,
    round(mean_exec_time::numeric, 2) as mean,
    round(
        (100 * total_exec_time / sum(total_exec_time::numeric)
            OVER ())::numeric, 2) as percentage_overall
    FROM pg_stat_statements
    ORDER BY total_exec_time DESC
    LIMIT 10;
```

Here we can see we have some very slow query that took n secondes to complete.
```
```

Let's copy the slow query and add EXPLAIN ANALYSE to see what's going on
```sql
EXPLAIN ANALYSE SELECT p1."id", p0."assists", p0."champion_id", p0."deaths", p0."gold_earned", p0."items", p0."kills", p0."summoners", p0."team_id", p0."team_position", p0."win", p0."game_id", p0."summoner_id", p0."opponent_participant_id", p0."inserted_at", p0."updated_at", g1."id", g1."creation", g1."duration", g1."platform_id", g1."riot_id", g1."version", g1."winner", g1."inserted_at", g1."updated_at", p3."id", p3."assists", p3."champion_id", p3."deaths", p3."gold_earned", p3."items", p3."kills", p3."summoners", p3."team_id", p3."team_position", p3."win", p3."game_id", p3."summoner_id", p3."opponent_participant_id", p3."inserted_at", p3."updated_at", s2."id", s2."name", s2."platform_id", s2."puuid", s2."pro_id", s2."inserted_at", s2."updated_at", p4."id", p4."name", p4."team_id", p4."inserted_at", p4."updated_at"
                FROM "participants" AS p0
                    LEFT OUTER JOIN "games" AS g1 ON g1."id" = p0."game_id"
                    LEFT OUTER JOIN "summoners" AS s3 ON s2."id" = p0."summoner_id"
                    LEFT OUTER JOIN "participants" AS p3 ON p3."id" = p0."opponent_participant_id"
                    INNER JOIN "pros" AS p4 ON p4."id" = s2."pro_id"
                ORDER BY g1."creation" DESC LIMIT 20 OFFSET 0;
```

```
Limit  (cost=85141.81..85144.11 rows=20 width=542) (actual time=15181.500..15185.229 rows=20 loops=1)
  ->  Gather Merge  (cost=85141.81..161333.10 rows=662533 width=542) (actual time=15181.497..15185.221 rows=20 loops=1)
        Workers Planned: 1
        Workers Launched: 1
        ->  Sort  (cost=84141.80..85798.13 rows=662533 width=542) (actual time=11611.583..11611.598 rows=13 loops=2)
              Sort Key: g1.creation DESC
              Sort Method: top-N heapsort  Memory: 62kB
              Worker 0:  Sort Method: top-N heapsort  Memory: 52kB
              ->  Merge Join  (cost=2.01..66512.03 rows=662533 width=542) (actual time=1.231..11341.621 rows=97899 loops=2)
                    Merge Cond: (s2.pro_id = p4.id)
                    ->  Nested Loop Left Join  (cost=1.57..5183050.81 rows=662533 width=504) (actual time=0.743..11252.198 rows=97900 loops=2)
                          ->  Nested Loop Left Join  (cost=1.15..3714527.90 rows=662533 width=347) (actual time=0.558..6544.513 rows=97900 loops=2)
                                ->  Nested Loop  (cost=0.72..2477227.18 rows=662533 width=283) (actual time=0.423..3628.045 rows=97900 loops=2)
                                      ->  Parallel Index Scan using summoners_pro_id_index on summoners s2  (cost=0.29..48742.40 rows=50475 width=126) (actual time=0.027..23.474 rows=634 loops=2)
                                      ->  Index Scan using participants_summoner_id_index on participants p0  (cost=0.43..47.50 rows=61 width=157) (actual time=0.105..5.571 rows=154 loops=1268)
                                            Index Cond: (summoner_id = s2.id)
                                ->  Memoize  (cost=0.43..2.03 rows=1 width=64) (actual time=0.028..0.028 rows=1 loops=195800)
                                      Cache Key: p0.game_id
                                      Cache Mode: logical
                                      Hits: 5626  Misses: 48259  Evictions: 24316  Overflows: 0  Memory Usage: 4097kB
                                      Worker 0:  Hits: 24126  Misses: 117789  Evictions: 93835  Overflows: 0  Memory Usage: 4097kB
                                      ->  Index Scan using games_pkey on games g1  (cost=0.42..2.02 rows=1 width=64) (actual time=0.030..0.030 rows=1 loops=166048)
                                            Index Cond: (id = p0.game_id)
                          ->  Index Scan using participants_pkey on participants p3  (cost=0.43..2.22 rows=1 width=157) (actual time=0.046..0.046 rows=1 loops=195800)
                                Index Cond: (id = p0.opponent_participant_id)
                    ->  Index Scan using pros_pkey on pros p4  (cost=0.27..30.80 rows=382 width=38) (actual time=0.472..1.963 rows=240 loops=2)
```


We can see that the bad performance come from the ORDER BY game.creation DESC


### Creating an index on game creation

```elixir
mix ecto.gen.migration create_games_creation_desc_index 
```

Open the migration
```elixir
create index(:games, ["creation DESC"])
```

We are creating an index on games.creation DESC
**Actually it will work as well without the DESC but since we are only using DESC let's just do that**


## Let's run the EXPLAIN ANALYSE QUERY again

:( the index is not used why is that ?

When we use a simple query the index is used

After some digging it appear that using a left join make the planner unable to use the index on sort.
In this case there was no reason to use LEFT JOIN. I tend to use them a bit too often. I worked on dbs with null value everywhere and I take this habit.

Here there was no point to use LEFT JOIN all my foreign key except pro_id are not null and I don't want summoner where the pro_id is null the INNER JOIN take care of that. Let's replace the LEFT JOINs with INNER JOINs.

```
EXPLAIN ANALYSE SELECT p1."id", p0."assists", p0."champion_id", p0."deaths", p0."gold_earned", p0."items", p0."kills", p0."summoners", p0."team_id", p0."team_position", p0."win", p0."game_id", p0."summoner_id", p0."opponent_participant_id", p0."inserted_at", p0."updated_at", g1."id", g1."creation", g1."duration", g1."platform_id", g1."riot_id", g1."version", g1."winner", g1."inserted_at", g1."updated_at", p3."id", p3."assists", p3."champion_id", p3."deaths", p3."gold_earned", p3."items", p3."kills", p3."summoners", p3."team_id", p3."team_position", p3."win", p3."game_id", p3."summoner_id", p3."opponent_participant_id", p3."inserted_at", p3."updated_at", s2."id", s2."name", s2."platform_id", s2."puuid", s2."pro_id", s2."inserted_at", s2."updated_at", p4."id", p4."name", p4."team_id", p4."inserted_at", p4."updated_at"
                FROM "participants" AS p0
                    INNER JOIN "games" AS g1 ON g1."id" = p0."game_id"
                    INNER JOIN "summoners" AS s3 ON s2."id" = p0."summoner_id"
                    INNER JOIN "participants" AS p3 ON p3."id" = p0."opponent_participant_id"
                    INNER JOIN "pros" AS p4 ON p4."id" = s2."pro_id"
                ORDER BY g1."creation" DESC LIMIT 20 OFFSET 0;
```

The plan changed a lot we can see that the the creation index is now used and we went from 15 sec to 1 sec !

Let's update the query code

```elixir
  defp pro_participant_base_query do
    from participant in Participant,
      inner_join: game in assoc(participant, :game),
      as: :game,
      inner_join: summoner in assoc(participant, :summoner),
      inner_join: opponent_participant in assoc(participant, :opponent_participant),
      inner_join: pro in assoc(summoner, :pro),
      as: :pro,
      preload: [
        game: game,
        opponent_participant: opponent_participant,
        summoner: {summoner, pro: pro}
      ],
      order_by: [desc: game.creation]
  end
```

At this point I feel like problem solved but I was wrong.

It was still slow why ?

Going back to pg_stats.

There is this count that take n secondes

Turns out I used scrivener which use a LIMIT SKIP pagination. This kind of pagination can work but here since the query can change I depending of the user input I did not find a way to make it fast. The pagination was for the infinite scroll the difference is that in our case for probuild ex we don't need to jump to an arbitrary page or now how many results. We will replace scrivener with paginator.

Edit `mix.exs`
Remove scrivener and add paginator
```elixir
{:paginator, "~> 1.2.0"}
```

Edit `lib/probuild_ex/repo.ex`
```
defmodule ProbuildEx.Repo do
  use Ecto.Repo,
    otp_app: :probuild_ex,
    adapter: Ecto.Adapters.Postgres

  use Paginator,
    limit: 20,
    include_total_count: false
end
```
We removed scrivener and use paginator instead.
We use similar option.
We don't want to know the numbers of items

Edit `lib/probuild_ex/app.ex`
```elixir
  @doc """
  Query pro participant paginated based on search_opts.
  """
  def paginate_pro_participants(search_opts, after_cursor \\ nil) do
    query = Enum.reduce(search_opts, pro_participant_base_query(), &reduce_pro_participant_opts/2)

    opts = [
      cursor_fields: [{{:game, :creation}, :desc}],
      after: after_cursor
    ]

    Repo.paginate(query, opts)
  end
```

We replaced the page_number per the after_cursor we will paginate over game creation desc

Edit the liveview `lib/probuild_ex_web/live/game_live/index.ex`

Replace the default page to the paginator struct 
```elixir
  @defaults %{
    ...
    page: %Paginator.Page{metadata: %Paginator.Page.Metadata{}},
    ...
  }
```

Edit `lib/probuild_ex_web/live/game_live/index.html.heex`
```elixir
    <div id="infinite-scroll" phx-hook="InfiniteScroll" data-cursor={@page.metadata.after} class="w-full max-w-3xl py-2 flex justify-center">
      <.spinner load?={@load_more?} />
    </div>
```
Instead of data-page we pass the cursor. The idea is to block if the cursor null it mean we reach the last page.

```js
Hooks.InfiniteScroll = {
  cursor() {
    return this.el.dataset.cursor;
  },
  maybeLoadMore(entries) {
    const target = entries[0];
    if (target.isIntersecting && this.cursor() && !this.loadMore) {
      this.loadMore = true;
      this.pushEvent("load-more", {});
    }
  },
  mounted() {
    this.loadMore = false;
    this.handleEvent("load-more", () => {
      this.loadMore = false;
    })

    const options = {
      root: null,
      rootMargin: "-90% 0px 10% 0px",
      threshold: 1.0
    };
    this.observer = new IntersectionObserver(this.maybeLoadMore.bind(this), options);
    this.observer.observe(this.el);
  },
  reconnected() {
    this.loadMore = false;
  },
  beforeDestroy() {
    this.observer.unobserve(this.el);
  },
};
```

I did some clean up here and prevent the client to send extra load more if the server did not answer yet.

Edit the liveview `lib/probuild_ex_web/live/game_live/index.ex`
```elixir
  def handle_event("load-more", _params, socket) do
    page = socket.assigns.page
    load_more? = socket.assigns.load_more?

    socket =
      if not load_more? and not is_nil(page.metadata.after) do
        opts = App.Search.to_map(socket.assigns.search)
        # Don't block the load-more event, execute the slow request in handle_info
        send(self(), {:query_pro_participants, opts, page.metadata.after})
        assign(socket, load_more?: true)
      else
        socket
      end

    {:noreply, socket}
  end
```

If it's not already loading more and the after cursor is not nil then we send the query


Edit the liveview `lib/probuild_ex_web/live/game_live/index.ex`
```elixir
  def handle_info({:query_pro_participants, opts, after_cursor}, socket) do
    page = App.paginate_pro_participants(opts, after_cursor)

    socket =
      socket
      |> assign(
        update: "append",
        page: page,
        participants: page.entries,
        load_more?: false
      )
      |> push_event("load-more", %{})

    {:noreply, socket}
  end
```

Here we editer the name of the parameter it's an after cursor and not a page now and now when the query return we send an event to our phx-hook to allow load_more event to be push again.


## Let's try the query now

video

Success almost instant !

## Closing thoughts

Well done and thanks for sticking with me to the end! It was very intresting to investigage these slow query and pagination issue and hopefully you picked up a couple of cool tips and tricks along the way.

I encourage you to continue there still a lot that we can do with all those data. Examples:
- A new liveview to display the most picked champions of pro player per patch / role/ region
- A new liveview to display the best / worst champions winrate
- Add new source to add pro player / streamers
- Your ideas ...


Be sure to sign up to the newsletter so that you won't miss my next article. Feel free to leave comments or feedback especially if you did the whole series. I also appreciate if you can star ⭐ the companion code [repo](https://github.com/mrdotb/probuild_ex).


Until Next Time !
{{< newsletter >}}

