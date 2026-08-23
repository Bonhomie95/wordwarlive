# Deploy: sticky routing for multi-node

WordWar's realtime layer needs **sticky sessions** (a.k.a. session affinity)
the moment you run more than one server instance. This folder has a ready
nginx config; below are the equivalents for the common managed platforms.

## Why it's required

1. **Socket.io transport.** A connection begins as HTTP long-polling and
   upgrades to WebSocket. Every request in that handshake must hit the same
   backend or the client gets `Session ID unknown` / HTTP 400. Sticky sessions
   fix this. The Redis adapter (already wired) only handles cross-node
   *broadcast* — it does not remove the stickiness requirement.

2. **Match co-location.** A live match's timers and state live in one node's
   memory. Ranked matchmaking uses a **per-node queue** (`mm:queue:{NODE_ID}`)
   so it only ever pairs two players whose sockets are on the same node — and
   sticky sessions keep each user pinned to that node for the whole session, so
   the pairing stays valid. If a match's players are somehow not co-located,
   `startMatch` refuses cleanly instead of starting a broken match.

## Set this on every instance

- `TRUST_PROXY=1` (or the real number of proxy hops) — so rate limiting sees
  the client IP, not the LB.
- `NODE_ID=<stable per-instance id>` — e.g. the pod/task name. Keeps a
  restarted instance on the same queue namespace.
- Same `REDIS_URL` and `DATABASE_URL` across all instances (shared adapter,
  presence, queues, and data).

## Platform recipes

### nginx (self-managed)
Use [`nginx.conf`](./nginx.conf) — `ip_hash` upstream + WebSocket upgrade
headers. Swap in cookie-based stickiness if many clients share NATed IPs.

### AWS ALB
Target group → **Attributes → Stickiness: enabled**, type
*Application-based* or *Duration-based* cookie, ~1 hour. Enable WebSockets
(ALB supports them natively). Health check path: `/readyz`.

### Kubernetes (ingress-nginx)
On the Service or Ingress:
```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/affinity: "cookie"
    nginx.ingress.kubernetes.io/affinity-mode: "persistent"
    nginx.ingress.kubernetes.io/session-cookie-name: "ww_srv"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
```
Set `NODE_ID` from the pod name via the downward API:
```yaml
env:
  - name: NODE_ID
    valueFrom: { fieldRef: { fieldPath: metadata.name } }
```

### Fly.io
Fly routes a WebSocket to a consistent instance within a region by default;
for HTTP add `[[services]]`-level sticky handling or keep websocket-first.
Prefer a single region for the match tier early on. Set `NODE_ID` from
`FLY_MACHINE_ID`.

### Render
Enable **Session Affinity** on the Web Service (Settings → Session Affinity).
Render injects `RENDER_INSTANCE_ID` — map it to `NODE_ID`.

## When you outgrow this

Per-node matchmaking + sticky sessions scale ranked play across nodes and keep
social/presence correct everywhere. The remaining limitation is **live friend
challenges / private matches across nodes** — if two friends happen to be on
different instances, the challenge is refused with a clear message. Removing
that limit (and distributing a single match's runtime across nodes) needs
either cross-node match-action forwarding over Redis, or moving match state
into Redis. That's deliberately deferred until a single match node's
CPU/DB is the real bottleneck — see README "Scaling & sticky routing".
