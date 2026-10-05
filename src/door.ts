// door.ts — a delivery to an identity's own inbox, verified here: the server
// that stores the inbox is the one the request reached, so the signature is
// checked while its headers exist and the receipt is written beside the
// activity. The same door code the front runs; nothing is renamed.
//
// And how much mail may wait. Unchecked mail is still taken, but an inbox
// holding WAITING_UNCHECKED items or more tells an unchecked sender to try
// later, and one holding WAITING_ANY tells everyone. Without a ceiling a
// stranger could fill the disk, and an inbox too big to list stops receiving.

import type { HttpHandlerInput, ResourceStore } from '@solid/community-server';
import { nodeToWhatwg } from './adapt';
import { EMBED, esmImport } from './fedipod';
import type { EmbeddedIdentity } from './identities';
import type { FediPodServerHandler } from './handler';

const WAITING_UNCHECKED = 1_000;
const WAITING_ANY = 5_000;
const RETRY_AFTER_SECONDS = 600;
const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains';
const RECEIPT = '.receipt.json';

// When each full inbox last said so in the log: once a minute, not per request.
const saidFull = new Map<string, number>();

/** Whether this identity's inbox has room for one more, checked or not. */
export function admits(h: FediPodServerHandler, inboxUrl: string, verified: boolean): boolean {
  return (h.internals().waiting.get(inboxUrl) ?? 0) < (verified ? WAITING_ANY : WAITING_UNCHECKED);
}

/** The items waiting in an inbox now, from one listing of it. */
export async function countWaiting(store: ResourceStore, inboxUrl: string): Promise<number> {
  try {
    const rep = await store.getRepresentation({ path: inboxUrl }, { type: { 'internal/quads': 1 } });
    let n = 0;
    for await (const q of rep.data as AsyncIterable<{ predicate: { value: string }; object: { value: string } }>) {
      if (q.predicate.value === LDP_CONTAINS && !q.object.value.endsWith(RECEIPT)) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

/** A write anywhere on the server, counted when it adds to or takes from a running identity's inbox. */
export function countChange(h: FediPodServerHandler, identifier: { path?: string } | undefined, activity: unknown): void {
  const kind = String((activity as { value?: string } | undefined)?.value ?? activity ?? '');
  const step = kind.endsWith('Create') ? 1 : kind.endsWith('Delete') ? -1 : 0;
  const p = identifier?.path ?? '';
  if (!step || p.endsWith('/') || p.endsWith(RECEIPT)) return;
  const s = h.internals();
  for (const inbox of s.waiting.keys()) {
    if (p.startsWith(inbox) && !p.slice(inbox.length).includes('/')) {
      s.waiting.set(inbox, Math.max(0, (s.waiting.get(inbox) ?? 0) + step));
      return;
    }
  }
}

/** Whether this request writes an item straight into the inbox through the pod, beside the door rather than through it. */
export function besideDoor(identity: EmbeddedIdentity, pathname: string, method?: string): boolean {
  if (![ 'PUT', 'POST', 'PATCH' ].includes(String(method).toUpperCase())) return false;
  const inboxPath = new URL(identity.inboxUrl).pathname;
  return pathname.startsWith(inboxPath) && pathname !== inboxPath;
}

/**
 * Whether this request writes beside the door into a full inbox. Such a write
 * carries nothing the door could check, so it gets the unchecked ceiling.
 */
export function fullInboxWrite(h: FediPodServerHandler, podBase: string, pathname: string, method?: string): boolean {
  const identity = h.internals().surfaces.get(podBase);
  return !!identity && besideDoor(identity, pathname, method) && !admits(h, identity.inboxUrl, false);
}

/** The answer to a sender the inbox has no room for. */
export function refuseFull(h: FediPodServerHandler, identity: EmbeddedIdentity,
  response: HttpHandlerInput['response']): void {
  const now = Date.now();
  if (now - (saidFull.get(identity.inboxUrl) ?? 0) > 60_000) {
    saidFull.set(identity.inboxUrl, now);
    h.internals().logger.warn(`FediPod: the inbox of @${identity.handle} is full — senders are told to try again later`);
  }
  response.writeHead(503, { 'content-type': 'application/json', 'retry-after': String(RETRY_AFTER_SECONDS) });
  response.end(JSON.stringify({ error: 'this inbox is full just now — try again later' }));
}

export async function deliverAtDoor(h: FediPodServerHandler, identity: EmbeddedIdentity,
  request: HttpHandlerInput['request'], response: HttpHandlerInput['response']): Promise<void> {
  const s = h.internals();
  // Full for everyone: answered before the body is read or a key fetched.
  if (!admits(h, identity.inboxUrl, true)) return refuseFull(h, identity, response);
  const { deliverToInbox } = await esmImport(EMBED) as {
    deliverToInbox: (agent: unknown, req: Request, opts: Record<string, unknown>) =>
      Promise<{ status: number; reason: string }>;
  };
  let whatwg: Request;
  try {
    // The pod's own origin: the signature covers the path and the Host header, and both are the pod's.
    whatwg = await nodeToWhatwg(request as never, new URL(identity.podHome).origin);
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode === 413 ? 413 : 400;
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: (e as Error).message }));
    return;
  }
  const out = await deliverToInbox(identity.agent, whatwg, {
    podPut: (url: string, body: string, ct: string) => s.podPut(url, body, ct),
    gatewayWebId: s.args.gatewayWebId ?? null,
    admit: (verified: boolean) => admits(h, identity.inboxUrl, verified),
  });
  if (out.status === 503) return refuseFull(h, identity, response);
  s.logger.info(`FediPod: delivery for @${identity.handle} at the door — ${out.reason} (${out.status})`);
  response.writeHead(out.status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ reason: out.reason }));
}
