# Changes

## 2026-10-05 — version 0.32.0, on fedipod 1.49.0

**A stranger can no longer fill an account's inbox.** Mail that cannot be
checked is still taken, but once 1,000 messages are waiting its sender is told
to try again in ten minutes, and once 5,000 are waiting every sender is. This
applies to mail written straight into the inbox through the pod as well as to
deliveries. A stranger could otherwise fill the server's disk, and an account
with too much mail waiting stopped receiving any.

**Your management link no longer puts your management key in the server's
log.** The link carries a key that works for two minutes; once you are in, your
browser stays in for a year as before. A link opened later than that does not
work; open your account page again for a fresh one.

**Signing up a pod is for this server's own pods.** A request naming a pod
elsewhere is refused before anything is fetched, so a stranger cannot make the
server send requests to addresses of their choosing.

**Someone with a pod elsewhere can no longer take an address at this server's
name** before the owner of the pod called that name turns their account on.

More fixes come with the fedipod release this one is built on: private posts,
one-click app sign-in, app registration floods, read-only apps posting, web
pages as profile pictures, notifications to signed-out apps, and made-up
sign-ins that fetch addresses. FediPod's CHANGES.md describes them.

Changes up to and including 0.31.0 are recorded in FediPod's
[CHANGES.md](https://github.com/jeff-zucker/FediPod/blob/main/CHANGES.md),
under the headings that name fedipod-server.
