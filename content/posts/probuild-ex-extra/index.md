+++
title = 'Probuild Ex Extra'
date = '2023-01-31T06:48:56+01:00'
author = 'mrdotb'
description = 'Probuild Ex front started to be unresponsive. My journey about debugging and optimizing queries.'
tags = ['elixir', 'phoenix', 'ecto', 'tutorial', 'pagination', 'postgres']
toc = true
showReadingTime = true
cover = "/posts/probuild-ex-extra/cover.jpg"
+++

## Intro

It's been three months since Probuild Ex is collecting data 24/7. The database grew to 1500 MB. The front was unresponsive. I did some digging and made it fast again. I wanted to share my journey about debugging and optimizing query.

*A league of legend probuilds provide easy access league of legends to Pro players builds across regions ex: ([probuilds.net](https://www.probuilds.net/), [probuildstats.com](https://probuildstats.com/))*


## Have a peak 👀 at Probuild Ex
https://probuild.fly.dev/

## Miss the series ?
You can start on [Part one](/posts/probuild-ex-part-one/).

*It's a phoenix 1.6 app using liveview 0.17. I plan to upgrade the series when phoenix 1.7 is officially released.*

{{< newsletter >}}

## Unresponsive front

{{< youtube vFbHXYz6sSM >}}

The query is really slow.


## The `pg_stat_statements` extension

We will use the [pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html) module. It provides a means for tracking planning and execution statistics of all SQL statements executed by a server. The statistics are made available through a view called `pg_stat_statements`.

### Activating the `pg_stat_statements` extension

With docker compose
```shell
docker compose -f docker-compose.dev.yml exec -i postgres sh -c '\
export PGDATA="/var/lib/postgresql/data"; \
sed -i '/shared_preload_libraries/d' $PGDATA/postgresql.conf; \
sed -i '/pg_stat_statements/d' $PGDATA/postgresql.conf; \
echo "shared_preload_libraries = 'pg_stat_statements'" >> $PGDATA/postgresql.conf; \
echo "pg_stat_statements.max = 10000" >> $PGDATA/postgresql.conf; \
echo "pg_stat_statements.track = all" >> $PGDATA/postgresql.conf; \
'
```

On [fly.io](https://fly.io/) postgres we need to run this.
```
fly postgres config update -a probuild-db --shared-preload-libraries pg_stat_statements
fly restart -a probuild-db
```

I created a new migration.

```elixir
mix ecto.gen.migration create_extension_pg_stat_statements
```

`migrations/XXXXXXXXXX_create_extension_pg_stat_statements.exs`

```elixir
def change do
  execute """
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements
  """
end
```

### Running the migration
```elixir
mix ecto.migrate
```

### Query the `pg_stat_statements` View

I used the front of Probuild Ex to push some stats first. Then I used psql to query the view.

I found this nice query for pg_stat_statements from this [article](https://www.cybertec-postgresql.com/en/postgresql-detecting-slow-queries-quickly/).
```sql
SELECT
    substring(query, 1, 30) AS query,
    calls,
    round(total_exec_time::numeric, 2) AS total_time,
    round(mean_exec_time::numeric, 2) AS mean_time,
    round((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 2) AS percentage
FROM
    pg_stat_statements
ORDER BY
    total_exec_time DESC
LIMIT 10;
```

It give us our worst queries. *This is the result on my local machine. It's 6 to 8 times slower on the production fly.io postgres*
```shell
             query              | calls | total_time | mean_time | percentage
--------------------------------+-------+------------+-----------+------------
 SELECT p0."id", p0."assists",  |     6 |    4291.19 |    715.20 |      56.06
 SELECT count($1) FROM "partici |     6 |    1227.87 |    204.64 |      16.04
```


## EXPLAIN ANALYSE the main query

I copied the worst query and replaced the select part with `*` for simplicity.
I used [EXPLAIN ANALYSE](https://www.postgresql.org/docs/current/sql-explain.html) on the slow query to see what's going on on the planner.

```sql
EXPLAIN ANALYSE
SELECT
    *
FROM
    "participants" AS p0
    LEFT OUTER JOIN "games" AS g1 ON g1."id" = p0."game_id"
    LEFT OUTER JOIN "summoners" AS s2 ON s2."id" = p0."summoner_id"
    LEFT OUTER JOIN "participants" AS p3 ON p3."id" = p0."opponent_participant_id"
    INNER JOIN "pros" AS p4 ON p4."id" = s2."pro_id"
ORDER BY
    g1."creation" DESC
LIMIT 20 OFFSET 0;
```

```
Limit  (cost=34353.67..34355.97 rows=20 width=542) (actual time=663.820..666.611 rows=20 loops=1)
 ->  Gather Merge  (cost=34353.67..120796.41 rows=751676 width=542) (actual time=663.818..666.608 rows=20 loops=1)
       Workers Planned: 1
       Workers Launched: 1
       ->  Sort  (cost=33353.66..35232.85 rows=751676 width=542) (actual time=648.953..648.956 rows=14 loops=2)
             Sort Key: g1.creation DESC
             Sort Method: top-N heapsort  Memory: 62kB
             Worker 0:  Sort Method: top-N heapsort  Memory: 49kB
             ->  Merge Join  (cost=26.32..13351.83 rows=751676 width=542) (actual time=0.205..600.064 rows=101046 loops=2)
                   Merge Cond: (s2.pro_id = p4.id)
                   ->  Nested Loop Left Join  (cost=1.56..956093.17 rows=751676 width=504) (actual time=0.086..578.614 rows=101048 loops=2)
                         ->  Nested Loop Left Join  (cost=1.14..540009.23 rows=751676 width=347) (actual time=0.065..344.268 rows=101048 loops=2)
                               ->  Nested Loop  (cost=0.72..208522.07 rows=751676 width=283) (actual time=0.043..176.207 rows=101048 loops=2)
                                     ->  Parallel Index Scan using summoners_pro_id_index on summoners s2  (cost=0.29..6880.97 rows=55166 width=126) (actual time=0.015..0.925 rows=642 loops=2)
                                     ->  Index Scan using participants_summoner_id_index on participants p0  (cost=0.43..2.99 rows=67 width=157) (actual time=0.004..0.246 rows=157 loops=1285)
                                           Index Cond: (summoner_id = s2.id)
                               ->  Index Scan using games_pkey on games g1  (cost=0.42..0.44 rows=1 width=64) (actual time=0.001..0.001 rows=1 loops=202095)
                                     Index Cond: (id = p0.game_id)
                         ->  Index Scan using participants_pkey on participants p3  (cost=0.43..0.55 rows=1 width=157) (actual time=0.002..0.002 rows=1 loops=202095)
                               Index Cond: (id = p0.opponent_participant_id)
                   ->  Sort  (cost=24.74..25.72 rows=391 width=38) (actual time=0.110..0.134 rows=370 loops=2)
                         Sort Key: p4.id
                         Sort Method: quicksort  Memory: 55kB
                         Worker 0:  Sort Method: quicksort  Memory: 55kB
                         ->  Seq Scan on pros p4  (cost=0.00..7.91 rows=391 width=38) (actual time=0.006..0.040 rows=391 loops=2)
 Planning Time: 1.870 ms
 Execution Time: 666.793 ms
(27 rows)
```
A query plan can be intimidating at first. To understand a query plan, the following aspects should be considered:
- Query Steps: A query plan consists of a series of steps that describe the operations to be performed to execute a query. The steps can include scans, joins, sorts, and aggregation operations, among others.
- Cost: The cost of each step in the plan gives an estimate of the processing time and resources required to execute that step.
- Actual Time: The actual time measurement provides an estimate of the time taken to execute the step during the execution of the query.
- Row Counts: The row counts give an estimate of the number of rows processed by each step in the plan.
- Index Usage: Index usage is important to understand because it can impact the efficiency of the query plan. The query plan should show which indexes are being used and if they are being used effectively.
- Join Types: The type of join used in the plan can impact its efficiency. Understanding the join types being used in the plan and their impact on performance is important.
- Index Scans: Index scans are a common operation in query plans. Understanding the type of scan being used and its impact on performance is important.
- Parallelization: Parallelization of operations in the query plan can improve performance. Understanding if and how operations are being parallelized in the plan is important.
- Memory Usage: Memory usage can impact performance. Understanding the memory usage of each step in the plan and if it is causing any performance issues is important.

The step that takes the most time in this plan is the "Sort" step with a cost of 15181.497..15185.221. *We ignore "LIMIT" and "Gather Merge" step because they are parent step*
We can optimize the ORDER BY clause using an index to improve the sorting performance.


### Creating the index on games.creation

```elixir
mix ecto.gen.migration create_games_creation_desc_index 
```

`migrations/XXXXXXXXXX_create_games_creation_desc_index.exs`

```elixir
def change do
  create index(:games, ["creation DESC"])
  """
end
```

Running the migration

```elixir
mix ecto.migrate
```

This will create an index on the column `creation` in the table `games`, with the sort order set to descending (DESC).

## Let's check the plan again

```sql
 Limit  (cost=34353.67..34355.97 rows=20 width=542) (actual time=660.973..663.702 rows=20 loops=1)
   ->  Gather Merge  (cost=34353.67..120796.41 rows=751676 width=542) (actual time=660.972..663.699 rows=20 loops=1)
         Workers Planned: 1
         Workers Launched: 1
         ->  Sort  (cost=33353.66..35232.85 rows=751676 width=542) (actual time=645.049..645.051 rows=14 loops=2)
               Sort Key: g1.creation DESC
               Sort Method: top-N heapsort  Memory: 62kB
               Worker 0:  Sort Method: top-N heapsort  Memory: 49kB
               ->  Merge Join  (cost=26.32..13351.83 rows=751676 width=542) (actual time=0.272..596.583 rows=101046 loops=2)
                     Merge Cond: (s2.pro_id = p4.id)
                     ->  Nested Loop Left Join  (cost=1.56..956093.17 rows=751676 width=504) (actual time=0.113..575.451 rows=101048 loops=2)
                           ->  Nested Loop Left Join  (cost=1.14..540009.23 rows=751676 width=347) (actual time=0.084..342.305 rows=101048 loops=2)
                                 ->  Nested Loop  (cost=0.72..208522.07 rows=751676 width=283) (actual time=0.058..174.547 rows=101048 loops=2)
                                       ->  Parallel Index Scan using summoners_pro_id_index on summoners s2  (cost=0.29..6880.97 rows=55166 width=126) (actual time=0.021..0.916 rows=642 loops=2)
                                       ->  Index Scan using participants_summoner_id_index on participants p0  (cost=0.43..2.99 rows=67 width=157) (actual time=0.004..0.244 rows=157 loops=1285)
                                             Index Cond: (summoner_id = s2.id)
                                 ->  Index Scan using games_pkey on games g1  (cost=0.42..0.44 rows=1 width=64) (actual time=0.001..0.001 rows=1 loops=202095)
                                       Index Cond: (id = p0.game_id)
                           ->  Index Scan using participants_pkey on participants p3  (cost=0.43..0.55 rows=1 width=157) (actual time=0.002..0.002 rows=1 loops=202095)
                                 Index Cond: (id = p0.opponent_participant_id)
                     ->  Sort  (cost=24.74..25.72 rows=391 width=38) (actual time=0.144..0.171 rows=370 loops=2)
                           Sort Key: p4.id
                           Sort Method: quicksort  Memory: 55kB
                           Worker 0:  Sort Method: quicksort  Memory: 55kB
                           ->  Seq Scan on pros p4  (cost=0.00..7.91 rows=391 width=38) (actual time=0.008..0.049 rows=391 loops=2)
 Planning Time: 1.849 ms
 Execution Time: 663.885 ms
(27 rows)
```

The plan did not change, the index is not used why is that ?

After some digging it appear that using a `LEFT JOIN` make the planner unable to use the index.
Here there was no reasons to use a `LEFT JOIN` all my foreign key except `summoner.pro_id` are not nullable and I don't want summoner where the pro_id is null. Let's replace the `LEFT JOIN` with `INNER JOIN`.

```sql
EXPLAIN ANALYSE
SELECT
    *
FROM
    "participants" AS p0
    INNER JOIN "games" AS g1 ON g1."id" = p0."game_id"
    INNER JOIN "summoners" AS s2 ON s2."id" = p0."summoner_id"
    INNER JOIN "participants" AS p3 ON p3."id" = p0."opponent_participant_id"
    INNER JOIN "pros" AS p4 ON p4."id" = s2."pro_id"
ORDER BY
    g1."creation" DESC
LIMIT 20 OFFSET 0;
```

```sql
 Limit  (cost=1.86..17.58 rows=20 width=542) (actual time=0.162..1.667 rows=20 loops=1)
   ->  Nested Loop  (cost=1.86..1004296.04 rows=1277849 width=542) (actual time=0.161..1.662 rows=20 loops=1)
         ->  Nested Loop  (cost=1.57..972258.74 rows=1277849 width=504) (actual time=0.078..1.548 rows=139 loops=1)
               ->  Nested Loop  (cost=1.15..264916.07 rows=1277849 width=347) (actual time=0.067..1.221 rows=139 loops=1)
                     ->  Nested Loop  (cost=0.84..226896.33 rows=1277849 width=221) (actual time=0.044..0.193 rows=139 loops=1)
                           ->  Index Scan using "games_creation_DESC_index" on games g1  (cost=0.42..6547.37 rows=127785 width=64) (actual time=0.025..0.038 rows=14 loops=1)
                           ->  Index Scan using participants_game_id_index on participants p0  (cost=0.43..1.62 rows=10 width=157) (actual time=0.005..0.007 rows=10 loops=14)
                                 Index Cond: (game_id = g1.id)
                     ->  Memoize  (cost=0.30..0.33 rows=1 width=126) (actual time=0.007..0.007 rows=1 loops=139)
                           Cache Key: p0.summoner_id
                           Cache Mode: logical
                           Hits: 3  Misses: 136  Evictions: 0  Overflows: 0  Memory Usage: 31kB
                           ->  Index Scan using summoners_pkey on summoners s2  (cost=0.29..0.32 rows=1 width=126) (actual time=0.006..0.006 rows=1 loops=136)
                                 Index Cond: (id = p0.summoner_id)
               ->  Index Scan using participants_pkey on participants p3  (cost=0.43..0.55 rows=1 width=157) (actual time=0.002..0.002 rows=1 loops=139)
                     Index Cond: (id = p0.opponent_participant_id)
         ->  Memoize  (cost=0.28..0.30 rows=1 width=38) (actual time=0.000..0.000 rows=0 loops=139)
               Cache Key: s2.pro_id
               Cache Mode: logical
               Hits: 118  Misses: 21  Evictions: 0  Overflows: 0  Memory Usage: 3kB
               ->  Index Scan using pros_pkey on pros p4  (cost=0.27..0.29 rows=1 width=38) (actual time=0.002..0.002 rows=1 loops=21)
                     Index Cond: (id = s2.pro_id)
 Planning Time: 1.963 ms
 Execution Time: 2.154 ms
(24 rows)
```

The plan changed a lot we can see that the `games_creation_DESC_index` is used and we went from an execution time of 663 ms to 2 ms !

I replaced the `left_join` in elixir code `lib/probuild_ex/app.ex`.

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

## The count query

```sql
EXPLAIN ANALYSE
SELECT
    count(*)
FROM
    "participants" AS p0
    INNER JOIN "games" AS g1 ON g1."id" = p0."game_id"
    INNER JOIN "summoners" AS s2 ON s2."id" = p0."summoner_id"
    INNER JOIN "participants" AS p3 ON p3."id" = p0."opponent_participant_id"
    INNER JOIN "pros" AS p4 ON p4."id" = s2."pro_id"
ORDER BY
    g1."creation" DESC;
```

```sql
 Finalize Aggregate  (cost=14660.96..14660.97 rows=1 width=8) (actual time=464.478..467.760 rows=1 loops=1)
   ->  Gather  (cost=14660.85..14660.96 rows=1 width=8) (actual time=459.552..467.755 rows=2 loops=1)
         Workers Planned: 1
         Workers Launched: 1
         ->  Partial Aggregate  (cost=13660.85..13660.86 rows=1 width=8) (actual time=458.697..458.699 rows=1 loops=2)
               ->  Merge Join  (cost=26.33..11781.66 rows=751676 width=0) (actual time=0.256..453.966 rows=101046 loops=2)
                     Merge Cond: (s2.pro_id = p4.id)
                     ->  Nested Loop  (cost=1.57..842310.89 rows=751676 width=8) (actual time=0.111..443.776 rows=101048 loops=2)
                           ->  Nested Loop  (cost=1.15..499563.34 rows=751676 width=16) (actual time=0.085..302.005 rows=101048 loops=2)
                                 ->  Nested Loop  (cost=0.72..208522.07 rows=751676 width=24) (actual time=0.050..165.244 rows=101048 loops=2)
                                       ->  Parallel Index Scan using summoners_pro_id_index on summoners s2  (cost=0.29..6880.97 rows=55166 width=16) (actual time=0.018..0.833 rows=642 loops=2)
                                       ->  Index Scan using participants_summoner_id_index on participants p0  (cost=0.43..2.99 rows=67 width=24) (actual time=0.004..0.238 rows=157 loops=1285)
                                             Index Cond: (summoner_id = s2.id)
                                 ->  Memoize  (cost=0.43..0.45 rows=1 width=8) (actual time=0.001..0.001 rows=1 loops=202095)
                                       Cache Key: p0.game_id
                                       Cache Mode: logical
                                       Hits: 15492  Misses: 84859  Evictions: 47410  Overflows: 0  Memory Usage: 4097kB
                                       Worker 0:  Hits: 21466  Misses: 80278  Evictions: 42829  Overflows: 0  Memory Usage: 4097kB
                                       ->  Index Only Scan using games_pkey on games g1  (cost=0.42..0.44 rows=1 width=8) (actual time=0.001..0.001 rows=1 loops=165137)
                                             Index Cond: (id = p0.game_id)
                                             Heap Fetches: 0
                           ->  Index Only Scan using participants_pkey on participants p3  (cost=0.43..0.46 rows=1 width=8) (actual time=0.001..0.001 rows=1 loops=202095)
                                 Index Cond: (id = p0.opponent_participant_id)
                                 Heap Fetches: 0
                     ->  Sort  (cost=24.74..25.72 rows=391 width=8) (actual time=0.135..0.162 rows=370 loops=2)
                           Sort Key: p4.id
                           Sort Method: quicksort  Memory: 43kB
                           Worker 0:  Sort Method: quicksort  Memory: 43kB
                           ->  Seq Scan on pros p4  (cost=0.00..7.91 rows=391 width=8) (actual time=0.008..0.049 rows=391 loops=2)
 Planning Time: 1.265 ms
 Execution Time: 468.978 ms
(31 rows)
```

Unfortunately I did not find a way to improve this query. I decided to get ride of it instead. I used [scrivener_ecto](https://github.com/drewolson/scrivener_ecto) which use a `LIMIT OFFSET` pagination.
The `LIMIT OFFSET` pagination requires a `COUNT`, to determine the total number of rows before applying the limit and offset.
For my use case I wanted a pagination to do an infinite scroll. Cursor based pagination is a better fit for an infinite scroll because it allows to efficiently fetch only the next set of results based on the position of a cursor.
I chose the [paginator](https://hexdocs.pm/paginator/readme.html) library.

I removed scrivener and added paginator in `mix.exs`
```elixir
{:paginator, "~> 1.2.0"}
```

In `lib/probuild_ex/repo.ex`
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
I removed scrivener and use paginator with similar options.
I don't want to know the `total_count` since it will make a slow count request.

`lib/probuild_ex/app.ex`
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

I replaced the `page_number` with the `after_cursor` we will paginate over `game.creation desc`.

In the liveview `lib/probuild_ex_web/live/game_live/index.ex`

I replaced the @defaults page with the paginator struct.
```elixir
  @defaults %{
    ...
    page: %Paginator.Page{metadata: %Paginator.Page.Metadata{}},
    ...
  }
```

`lib/probuild_ex_web/live/game_live/index.html.heex`
```elixir
    <div id="infinite-scroll" phx-hook="InfiniteScroll" data-cursor={@page.metadata.after} class="w-full max-w-3xl py-2 flex justify-center">
      <.spinner load?={@load_more?} />
    </div>
```
In the view I passed the cursor instead of a page. The idea is to prevent further request if the cursor is null which mean we reached the last page.

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
    // block until the back-end told us we can load more again
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
    // in case we go offline and miss the event
    this.loadMore = false;
  },
  beforeDestroy() {
    this.observer.unobserve(this.el);
  },
};
```

I did some clean up here and prevent the client to send extra load more if the server did not answer yet.

liveview `lib/probuild_ex_web/live/game_live/index.ex`
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

If it's not already loading more and the after cursor is not nil then we query.

liveview `lib/probuild_ex_web/live/game_live/index.ex`
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

We receive an after cursor and not a page and when the query return we send an event to our `phx-hook` to allow `load_more` event to be pushed again.

## Let's try the query now

{{< youtube FkPqyibON48 >}}

Success almost instant !

## Closing thoughts

Well done and thanks for sticking with me to the end! It was very interesting to investigate these slow query and pagination issue and hopefully you picked up a couple of cool tips and tricks along the way.

Be sure to sign up to the newsletter so that you won't miss my next article. Feel free to leave comments or feedback especially if you did the whole series. I also appreciate if you can star ⭐ the companion code [repo](https://github.com/mrdotb/probuild_ex).


Until Next Time !
{{< newsletter >}}
