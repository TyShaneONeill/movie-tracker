-- M7: Add input length validation on fields missing CHECK constraints
-- watchlist_comments.text already has char_length >= 1 AND <= 500

-- First Takes quote_text: max 2000 chars (reviews can be lengthy)
ALTER TABLE public.first_takes
  ADD CONSTRAINT first_takes_quote_text_length_check
  CHECK (char_length(quote_text) <= 2000);

-- User lists name: max 200 chars
ALTER TABLE public.user_lists
  ADD CONSTRAINT user_lists_name_length_check
  CHECK (char_length(name) >= 1 AND char_length(name) <= 200);

-- User lists description: max 1000 chars
ALTER TABLE public.user_lists
  ADD CONSTRAINT user_lists_description_length_check
  CHECK (description IS NULL OR char_length(description) <= 1000);
