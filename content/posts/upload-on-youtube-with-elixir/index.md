+++
title = 'Upload on Youtube With Elixir'
date = '2022-03-13T13:50:53+01:00'
author = 'mrdotb'
description = 'How to upload a video on youtube programmatically with elixir and the YouTube Data API v3'
tags = ['elixir', 'youtube']
toc = true
showReadingTime = true
+++

## Intro

For a project of mine I had to upload video on youtube using the [Youtube data API](https://developers.google.com/youtube/v3/docs).
I struggled a bit to get the right OAuth token and on the [google generated elixir library](https://github.com/googleapis/elixir-google-api) ...

I detailed every step with the current 2022 google cloud interface.

The github repo for the elixir code
https://github.com/mrdotb/youtube_upload_with_elixir

## Setup on google cloud platform

### Create project

{{< lightbox
  src="/posts/upload-on-youtube-with-elixir/1-create-project.png"
  alt="Create google project"
>}}

### Enable Youtube api

Type `youtube api` in the search bar then click on YouTube Data api v3.
{{< lightbox
  src="/posts/upload-on-youtube-with-elixir/2-enable-youtube-api-1.png"
  alt="enable youtube api 1"
>}}

Enable it.
{{< lightbox
  src="/posts/upload-on-youtube-with-elixir/2-enable-youtube-api-2.png"
  alt="enable youtube api 2"
>}}


### Setup oauth consent screen

Click Oauth consent screen then tick external then create.
{{< lightbox
  src="/posts/upload-on-youtube-with-elixir/3-setup-oauth-consent-screen-1.png"
  alt="setup oauth consent screen 1"
>}}

Fill the mandatory fields App name, User support email and Email addresses.
{{< lightbox
  src="/posts/upload-on-youtube-with-elixir/3-setup-oauth-consent-screen-2.png"
  alt="setup oauth consent screen 2"
>}}

Add or remove scopes.
{{< lightbox
  src="/posts/upload-on-youtube-with-elixir/3-setup-oauth-consent-screen-3.png"
  alt="setup oauth consent screen 3"
>}}

Tick youtube and youtube upload then update.
{{< lightbox
  src="/posts/upload-on-youtube-with-elixir/3-setup-oauth-consent-screen-4.png"
  alt="setup oauth consent screen 4"
>}}

Add a test user this user is the google who own the youtube channel you want to upload.
{{< lightbox
  src="/posts/upload-on-youtube-with-elixir/3-setup-oauth-consent-screen-5.png"
  alt="setup oauth consent screen 5"
>}}


### Create credentials

Click create credentials then OAuth client ID.
{{< lightbox
  src="/posts/upload-on-youtube-with-elixir/4-create-credentials-1.png"
  alt="create credentials 1"
>}}

Choose Web application and fill the name and the return uri as `https://developers.google.com/oauthplayground`. This is mandatory to get the refresh token from the oauthplayground! Keep the page open you will need the `client_id` and `client_secret`. 
{{< lightbox
  src="/posts/upload-on-youtube-with-elixir/4-create-credentials-2.png"
  alt="create credentials 2"
>}}


### Get the refresh token on google playground

Go to [oauthplayground](https://developers.google.com/oauthplayground/).

On the right side of the screen open the settings and input your client id and client secret.
{{< lightbox
  src="/posts/upload-on-youtube-with-elixir/5-oauth-playground-1.png"
  alt="oauth playground 1"
>}}

On left side tick youtube and youtube.upload then click on authorize api you will be redirected and prompted to give the youtube authorization to your app.
{{< lightbox
  src="/posts/upload-on-youtube-with-elixir/5-oauth-playground-2.png"
  alt="oauth playground 2"
>}}

Now click exchange the authorization code for tokens. Copy the refresh token you will need it after.
{{< lightbox
  src="/posts/upload-on-youtube-with-elixir/5-oauth-playground-3.png"
  alt="oauth playground 3"
>}}

## Elixir code

```bash
mix new --sup upload_with_elixir
cd upload_with_elixir
```

Add these dependencies to your `mix.exs`
```elixir
...
    {:goth, "~> 1.3-rc"},
    {:hackney, "~> 1.17"},
    {:google_api_you_tube, "~> 0.40"}
...
```

Install the deps
```bash
mix deps.get
```

Edit `application.ex` to setup goth

{{< code language="elixir" title="lib/application.ex" >}}
defmodule UploadWithElixir.Application do
  use Application

  def start(_type, _args) do
    # I just put creds here in a real project you should use config
    credentials = %{
      # Fill it with your client id
      "client_id" => "...",
      # Fill it with your client secret
      "client_secret" => "...",
      # the token we got from the oauthplayground
      "refresh_token" => "..."
    }
    source = {:refresh_token, credentials, []}

    children = [
      {Goth, name: UploadWithElixir.Goth, source: source}
    ]

    Supervisor.start_link(children, strategy: :one_for_one)
  end
end
{{< /code >}}

Verify if you can get token with goth.
```elixir
Goth.fetch(UploadWithElixir.Goth)
{:ok, %Goth.Token{ ... }}
```

The google lib is verbose so let's write some function to do the insert.
{{< code language="elixir" >}}
defmodule UploadWithElixir do
  def video_insert do
    # get the token
    {:ok, token} = Goth.fetch(UploadWithElixir.Goth)

    # set the token
    conn = GoogleApi.YouTube.V3.Connection.new(token.token)

    # The path to your video
    video_path = Path.expand("./sample.webm", __DIR__)

    # upload
    GoogleApi.YouTube.V3.Api.Videos.youtube_videos_insert_simple(
      conn,
      ["snippet", "status"],
      "multipart",
      %GoogleApi.YouTube.V3.Model.Video{
        snippet: %GoogleApi.YouTube.V3.Model.VideoSnippet{
          title: "Test Video upload from elixir",
          description: "Description of the uploaded video"
        },
        status: %GoogleApi.YouTube.V3.Model.VideoStatus{
          privacyStatus: "private"
        }
      },
      video_path
    )
  end
end
{{< /code >}}

Start iex and run the function you should get ok.
```elixir
UploadWithElixir.video_insert()
{:ok, %GoogleApi.YouTube.V3.Model.Video{ ... }}
```

If it does not work.
There is 10,000 quota allocation an upload cost 1600. So if it does not work double check everything. Even a fail request cost 1600 you can do only 6 upload request per 24hours.

Some limitations:
- it's not possible to put the video as public without having you app verified by google...
- the refresh_token will expire after 7 days


{{< newsletter >}}
