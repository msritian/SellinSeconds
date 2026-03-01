-- Track when each participant last read the chat (for unread counts)
ALTER TABLE public.chat_participants
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_participants.last_read_at IS 'When this user last read messages in this chat; messages after this are unread (for sender_id != this user).';
