# Business dashboard

Independent businesses register at `/operator/sign-in`, choose a business type and sign in with email/password. A business type describes the business; it does not grant permission to take over a production workspace.

Businesses add products in their own production workspace. Each product has one Tracking ID and a downloadable QR. Public sharing is an explicit checkbox. Private descriptions never appear in the scan preview or public trace.

`/operator/receive` accepts the Tracking ID, short code, approved tracking link or camera QR. Scanning displays the current holder and open/closed state. The receiver must confirm physical receipt before the contract changes custody. No sender proposal, predetermined recipient, workspace membership or receiving role is needed. The expected custody version rejects stale requests, including after a product returns to a previous holder.

Inventory includes products a business produced, currently holds or previously handled, across all producers. Product history contains the previous/new business, recorded time, transaction and receipt evidence. Hex references are secondary information.

The current holder can close with Sold, Lost, Damaged or Disposed. Other businesses cannot close it. Closed products remain readable and cannot be received again. Customer scans only display history.

Browser credentials stay in an HttpOnly SameSite=Strict cookie. The Next.js server stores the API session credential in memory and forwards only fixed routes. Wallet keys stay in an owner-only configured server directory. Each write is journaled before broadcast, supports idempotent retry and verifies the contract receipt. Confirmed journals clear their serialized transaction.

Staff invitations remain an optional way to join an existing business. They are not required to register an independent business.

The in-memory Next.js session store currently assumes one UI process. A process restart signs users out; a shared session store is needed before horizontally scaling the UI.
