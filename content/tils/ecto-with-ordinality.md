+++
title = 'Ecto With Ordinality'
date = '2022-08-23T11:04:06+02:00'
author = 'mrdotb'
description = 'Ecto use postgres with Ordinality'
tags = ['til', 'postgres', 'ecto', 'fragment']
toc = false
showReadingTime = false
+++

# Ecto with ordinality

We want to query the post where the id is 1, 2, 4, 3 and keep this order
The best solution to do that using postgres is [WITH ORDINALITY](https://paquier.xyz/postgresql-2/postgres-9-4-feature-highlight-with-ordinality/)

```sql
SELECT p.*
FROM posts p
JOIN unnest('{1,2,4,3}'::int[]) WITH ORDINALITY t(id, ord) USING (id)
ORDER BY t.order;
```

Complete query

```elixir
def list_post_where_id_in_order(ids) do
  query =
    from post in Post,
      inner_join:
        ordinality in fragment(
          "SELECT * FROM UNNEST(?::int[]) WITH ORDINALITY as ordinality (id, num)",
          ^ids
        ),
      on: post.id == ordinality.id,
      order_by: [asc: ordinality.num]

  Repo.all(query)
end

iex> list_post_where_id_in_order([1, 2, 4, 3])
```

Composable query

```elixir
def post_by_id_in_order(query, ids) do
  query
  |> join(
    :inner,
    [post],
    ordinality in fragment(
      "SELECT * FROM UNNEST(?::int[]) WITH ORDINALITY as ordinality (id, num)",
      ^ids
    ),
    on: post.id == ordinality.id,
    as: :ordinality
  )
  |> order_by([post, ordinality: ordinality], asc: ordinality.num)
end

iex> Post |> post_by_id_in_order([1, 2, 4, 3]) |> Repo.all()
```

