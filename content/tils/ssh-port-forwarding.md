+++
title = 'ssh port forwarding'
date = '2020-11-13T21:21:21+01:00'
author = 'mrdotb'
description = 'How to forward ssh port'
tags = ['shell', 'network', 'til']
+++

## Make a local port accessible from a remote server.

Make sure the server `sshd_config` have `GatewayPorts yes`

```
+--------------+    +--------------+
|localhost:4000|    |localhost:8080|
|local computer|->>-|vps server    |
|49.237.17.80  |    |34.80.255.217 |
+--------------+    +--------------+
```

```bash
ssh -R 8080:localhost:4000 user@34.80.255.217
```

The traffic on the vps server port 8080 will be forwarded to your local computer port 4000.

## Access a remote port from local computer.

```
+--------------+    +--------------+
|localhost:4000|    |localhost:8080|
|local computer|-<<-|vps server    |
|49.237.17.80  |    |34.80.255.217 |
+--------------+    +--------------+
```

```bash
ssh -L 4000:localhost:8080 user@34.80.255.217
```

### Tips

Adding the flag `-nNT` will not open a shell on the remote server.
