import { ActionSheet } from '@/components/ui/action-sheet';

interface WatchedComposerChooserProps {
  visible: boolean;
  onClose: () => void;
  /** Open the First Take composer (a short, immediate reaction). */
  onSelectFirstTake: () => void;
  /** Open the Review composer (a longer, considered write-up). */
  onSelectReview: () => void;
}

/**
 * "First Take or Review?" chooser (N3) shown right after a movie/show is
 * marked watched, replacing the old behavior of auto-opening the First Take
 * composer. Gives users who prefer writing a full Review a route there
 * without getting funneled into a quick reaction first.
 *
 * Purely a router between the two existing composers — it doesn't change
 * what either one writes or its visibility defaults.
 *
 * COPY RULE: say nothing about who will see the post. Both composers default
 * to `preferences?.reviewVisibility ?? 'public'` (first-take-modal.tsx:105,
 * review-modal.tsx:94) and EITHER can be set to public, followers-only or
 * private from inside the composer. Earlier copy here read "shared with the
 * community" for First Take and "share it only if you choose" for Review,
 * which asserted a visibility rule the product does not implement — Ty caught
 * it on device. The honest axis between these two options is LENGTH AND
 * DELIBERATION, not privacy, so that is the only thing described.
 */
export function WatchedComposerChooser({
  visible,
  onClose,
  onSelectFirstTake,
  onSelectReview,
}: WatchedComposerChooserProps) {
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title="Share Your Take"
      options={[
        {
          label: 'First Take',
          description: 'A quick gut reaction, in a line or two',
          onPress: onSelectFirstTake,
        },
        {
          label: 'Review',
          description: 'A longer, considered write-up',
          onPress: onSelectReview,
        },
      ]}
    />
  );
}
