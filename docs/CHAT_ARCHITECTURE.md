# Chat – Architecture & Production Behaviour

## Supabase schema (relevant tables)

- **chats** – `id`, `product_id`, `created_at`
- **chat_participants** – `chat_id`, `user_id`, `role` (buyer | seller | helper), `joined_at`, `last_read_at` (for unread counts)
- **messages** – `id`, `chat_id`, `sender_id`, `content`, `sent_at`

RLS: participants can read/write only their chats and messages.

---

## API surface (same on Python backend and Next.js API routes)

| Method | Path | Description |
|--------|------|-------------|
| GET | /chat | List current user’s chats (product, other_party, last_message, unread_count) |
| PATCH | /chat/:id/read | Mark chat as read (set last_read_at) |
| POST | /chat/initiate | Create or return existing buyer+seller chat for a product |
| GET | /chat/:id | Chat metadata + product + my_role |
| GET | /chat/:id/messages | Messages (optional `limit`, max 500) |
| POST | /chat/:id/message | Send message |
| PATCH | /chat/:id/participants | Add participant (e.g. helper) |

---

## Production-grade behaviour

1. **Idempotent initiate**  
   Before creating a chat, both backend and Next.js check for an existing chat for the same `product_id` with the same buyer and seller. If found, that `chat_id` is returned and no duplicate is created.

2. **List chats (no N+1)**  
   - One query: my `chat_participants` (with `last_read_at`).  
   - One query: `chats` for those `chat_id`s.  
   - One query: `products` for those `product_id`s.  
   - One query: all `messages` in those chats (ordered by `sent_at` desc).  
   - One query: other participants (not me) for those chats.  
   - One query: `users` for those other participant ids.  
   Last message and unread count are computed in memory from the batched messages and `last_read_at`.

3. **Unread count**  
   For each chat, unread = messages where `sender_id != me` and (`last_read_at` is null or `sent_at > last_read_at`).  
   `last_read_at` is updated by `PATCH /chat/:id/read` when the user opens the chat.

4. **Messages list**  
   `GET /chat/:id/messages` supports optional `limit` (1–500, default 500) to cap response size.  
   Cursor-based pagination can be added later if needed.

---

## Frontend

- Chat list and detail use the same API (backend or Next.js via `getApiUrl`).  
- No changes required: same request/response shapes.  
- When only the Next.js API is used (no Python backend), `GET /chat` and `PATCH /chat/:id/read` are now implemented so list and read-marking work as before.
