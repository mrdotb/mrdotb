+++
title = 'Ecto Exclusive Belongs to Aka Arc'
date = '2022-01-16T19:23:47+01:00'
author = 'mrdotb'
description = 'How to create a exclusive belongs to aka arc in ecto'
tags = ['elixir', 'ecto', 'database']
toc = true
showReadingTime = true
+++

## Intro

I had to implement a exclusive belongs to for a phoenix app of mine...

I found this very interesting post on the subject but I had to implement it with ecto.
For my future self and for others here is the recipe.

[exclusive-belongs-to-aka-exclusive-arc-](https://hashrocket.com/blog/posts/modeling-polymorphic-associations-in-a-relational-database#exclusive-belongs-to-aka-exclusive-arc-)


## Diagram

*How it will look.*

![diagram exclusive belongs to](/posts/ecto-exclusive-belongs-to-aka-arc/diagram.svg)

## Migration

```elixir
defmodule ExclusiveArc.Repo.Migrations.CreateAcls do
  use Ecto.Migration

  def change do
    create table(:acls) do
      add :document_id, references(:documents, on_delete: :delete_all)
      add :image_id, references(:images, on_delete: :delete_all)
      add :file_id, references(:files, on_delete: :delete_all)
      add :report_id, references(:reports, on_delete: :delete_all)

      # acl is a simple text here is not the point of the til
      add :level, :text, null: false

      timestamps()
    end

    # ensure the it's exclusive
    check_exclusive = """
    (
      (document_id IS NOT NULL)::integer +
      (image_id IS NOT NULL)::integer +
      (file_id IS NOT NULL)::integer +
      (report_id IS NOT NULL)::integer
    ) = 1
    """

    create constraint(:acls, :check_exclusive, check: check_exclusive)

    create index(:acls, [:document_id], unique: true, where: "document_id IS NOT NULL")
    create index(:acls, [:image_id], unique: true, where: "image_id IS NOT NULL")
    create index(:acls, [:file_id], unique: true, where: "file_id IS NOT NULL")
    create index(:acls, [:report_id], unique: true, where: "report_id IS NOT NULL")
  end
end
```

## Schema

```elixir
defmodule ExclusiveArc.ACL do
  use Ecto.Schema

  alias Ecto.Changeset
  alias ExclusiveArc.Medias.{Document, Image, File, Report}

  schema "acls" do
    belongs_to :document, Document
    belongs_to :image, Image
    belongs_to :file, File
    belongs_to :report, Report

    field :level, :string

    timestamps()
  end

  @doc false
  def changeset(acl, attrs, media) do
    acl
    |> Changeset.cast(attrs, [:level])
    |> Changeset.validate_required([:level])
    |> assoc_media(media)
    # Last check if only one media was associated it's impossible to trigger
    # with this changeset but it will help in case of changes later in the project
    |> Changeset.check_constraint(:check_exclusive, name: :check_exclusive)
  end

  # Using pattern matching to associate the media and check the foreign key and unique constraint
  defp assoc_media(changeset, %Document{} = document) do
    changeset
    |> Changeset.put_assoc(:document, document)
    |> Changeset.foreign_key_constraint(:document_id)
    |> Changeset.unique_constraint(:document_id)
  end

  defp assoc_media(changeset, %Image{} = image) do
    changeset
    |> Changeset.put_assoc(:image, image)
    |> Changeset.foreign_key_constraint(:image_id)
    |> Changeset.unique_constraint(:image_id)
  end

  defp assoc_media(changeset, %File{} = file) do
    changeset
    |> Changeset.put_assoc(:file, file)
    |> Changeset.foreign_key_constraint(:file_id)
    |> Changeset.unique_constraint(:file_id)
  end

  defp assoc_media(changeset, %Report{} = report) do
    changeset
    |> Changeset.put_assoc(:report, report)
    |> Changeset.foreign_key_constraint(:report_id)
    |> Changeset.unique_constraint(:report_id)
  end
end
```

## Repository demo

https://github.com/mrdotb/exclusive_arc


{{< newsletter >}}
