# Business dashboard

Independent businesses register at `/operator/sign-in`, choose or create their business type in a searchable React Select picker and sign in with email/password. Predefined types such as manufacturer, transporter or retailer are optional; enter your own type and select “Use” to add it (up to 120 characters). A business type describes the business and does not restrict who it can receive products from or grant permission to take over another production workspace.

The public tracking pages and business dashboard use locally bundled Bootstrap
controls and buttons, a system font and a neutral colour palette. Forms have
visible labels, standard checkbox sizes and consistent spacing on desktop and
mobile. Product creation stays in Products → Add product; Overview shows the
business summary. Activity shows the progress of product updates.

The 2026-10-06 business-type and UI cleanup passed 29 UI unit tests and the full
78 desktop/mobile browser checks. The final form-label and page-title changes
also passed all 24 dashboard browser checks. Disposable API/chain integration
verified custom-type registration, storage and dynamic receipt/close with 14
confirmed transactions. Read-only checks against the local running app verified
aligned product actions, search/filter controls, additional-detail rows, public
tracking and reflow at 320px.

Businesses add products in their own production workspace. Each product has one Tracking ID and a downloadable QR. Public sharing is an explicit checkbox. Private product details never appear in the scan preview or public trace.

Overview shows business statistics and product summaries. To create a product,
open Products → Add product (`/operator/products/new`). Creation has its own
page; the form is absent from Overview and the product list.

The Add product form supports up to 32 additional fields. Operators choose each
field's name and value, add or remove rows, and use details such as batch number,
ingredients, size or expiry date without a predefined business schema. Names
must be unique; names allow 80 characters and text values 1,000 characters.
The product name and custom fields are saved together as JSON. There is no
separate description textarea; add a Description field when needed.
The exact stored JSON bytes are hashed and that hash is recorded on chain.
Product information shows the decoded product name and all saved fields as
labels and values. Descriptions on older products remain readable. Explicit public
sharing includes those fields; private products' fields remain unavailable to
public tracking and unrelated businesses.

The 2026-10-06 dynamic-fields delivery passed 29 UI unit tests, 78 desktop/mobile
browser tests and a disposable API/chain integration verifying JSON/hash
identity, public/private field visibility and unchanged-payload retries. A real
Pi product was created through the local browser and its fields checked in both
operator and public views: full Tracking ID
`0x89455d20a98680f6039dd75fe05fade79a6cc7ec94cac7ab55a75294b82fcf98`,
short code `dya3f5kmx1qs`. No contract redeployment or data reset was needed.

`/operator/receive` accepts the Tracking ID, short code, approved tracking link or camera QR. Scanning displays the current holder and supply-chain status. The receiver must confirm physical receipt before the contract changes custody. No sender proposal, predetermined recipient, workspace membership or receiving role is needed. The expected custody version rejects stale requests, including after a product returns to a previous holder.

Inventory includes products a business produced, currently holds or previously handled, across all producers. Product history contains the previous/new business, recorded time, transaction and receipt evidence. Hex references are secondary information.

The status badges read **In supply chain** (success) and **Out of supply chain**
(info). The current holder can choose Remove from supply chain and a reason:
delivered to customer, lost, damaged or disposed. Removed products remain
readable and cannot be received again. Customer scans only display history.

Business navigation uses a fixed left sidebar on desktop and a Show menu / Hide
menu button on mobile. Identical business and workspace names appear once.

Public and operator histories show one action per receive or removal. The
contract emits an action event and a matching TraceRecorded event for each; the
API filters only the exact adjacent companion before applying pagination.
Standalone updates stay visible, and all raw blockchain/indexer logs remain
available for auditing.

The 2026-10-06 history/sidebar follow-up passed 29 UI unit tests, 80 desktop/mobile
browser checks and API offline/MySQL regressions for paired events, independent
updates and exact pagination. Read-only checks of the running app confirmed four
actions for the existing demonstration product in both operator and public
views, decoded metadata, the mobile menu and success/info status badges.

Browser credentials stay in an HttpOnly SameSite=Strict cookie. The Next.js server stores the API session credential in memory and forwards only fixed routes. Wallet keys stay in an owner-only configured server directory. Each write is journaled before broadcast, supports idempotent retry and verifies the contract receipt. Confirmed journals clear their serialized transaction.

The signup/sign-in page offers independent business registration without an invitation button or activation form. Optional staff-invitation support remains in the API for joining an existing business.

The in-memory Next.js session store currently assumes one UI process. A process restart signs users out; a shared session store is needed before horizontally scaling the UI.
