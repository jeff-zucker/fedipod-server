// store-css.ts — the real IO over CSS's ResourceStore: the only file that
// imports CSS. Turns the store's Representation-based API into the tiny
// { read, write } shape the directory and podPut are written against.
//
// Writing here bypasses WAC by design: the lowest store assumes the necessary
// Solid checks were already made, and the gateway handler is the thing that
// made them — it only ever writes verified mail into an inbox, or a directory
// row into the gateway's own internal container.

import { BasicRepresentation, readableToString, NotFoundHttpError } from '@solid/community-server';
import type { ResourceStore } from '@solid/community-server';
import type { IO } from './directory';

/**
 * Whether this server holds the container or document at this address: a pod
 * here, or a WebID in one. Asked of the store, never over the network.
 */
export async function holdsHere(resourceStore: ResourceStore, url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    u.hash = '';
    return await resourceStore.hasResource({ path: u.href });
  } catch {
    return false;
  }
}

export function makeStoreIO(resourceStore: ResourceStore): IO {
  return {
    async read(url: string): Promise<string | null> {
      try {
        const rep = await resourceStore.getRepresentation({ path: url }, {});
        return await readableToString(rep.data);
      } catch (e: unknown) {
        if (NotFoundHttpError.isInstance?.(e) || (e as { statusCode?: number })?.statusCode === 404) return null;
        throw e;
      }
    },
    async write(url: string, body: string, contentType: string): Promise<void> {
      const rep = new BasicRepresentation(body, { path: url }, contentType);
      await resourceStore.setRepresentation({ path: url }, rep);
    },
    async remove(url: string): Promise<void> {
      try {
        await resourceStore.deleteResource({ path: url });
      } catch (e: unknown) {
        if (NotFoundHttpError.isInstance?.(e) || (e as { statusCode?: number })?.statusCode === 404) return;
        throw e;
      }
    },
  };
}
