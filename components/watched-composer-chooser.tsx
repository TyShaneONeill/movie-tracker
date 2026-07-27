import { ActionSheet } from '@/components/ui/action-sheet';

interface WatchedComposerChooserProps {
  visible: boolean;
  onClose: () => void;
  /** Open the First Take composer (quick reaction, shared with the community). */
  onSelectFirstTake: () => void;
  /** Open the Review composer (a fuller take — the user decides who sees it). */
  onSelectReview: () => void;
}

/**
 * "First Take or Review?" chooser (N3) shown right after a movie/show is
 * marked watched, replacing the old behavior of auto-opening the First Take
 * composer. Gives users who prefer writing a full Review a route there
 * without getting funneled into a quick public reaction first.
 *
 * Purely a router between the two existing composers — it doesn't change
 * what either one writes or its visibility defaults.
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
          description: 'A quick reaction, shared with the community',
          onPress: onSelectFirstTake,
        },
        {
          label: 'Review',
          description: 'A fuller take — share it only if you choose',
          onPress: onSelectReview,
        },
      ]}
    />
  );
}
