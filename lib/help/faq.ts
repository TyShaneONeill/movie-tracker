export type FaqCategory = 'tickets' | 'tracking' | 'account' | 'social' | 'premium';

export type FaqEntry = {
  id: string;
  question: string;
  answer: string; // plain text, paragraphs separated by \n\n
  category: FaqCategory;
};

export const FAQ: FaqEntry[] = [
  {
    id: 'scan-ticket',
    question: 'How do I scan a ticket?',
    answer:
      'Open the Scan tab in the bottom navigation. PocketStubs will open your camera so you can take a photo of your physical or digital ticket.\n\nWe automatically pull out the movie title, date, time, and theater so the stub is saved to your collection without manual entry. If a field looks wrong, you can edit it before saving.',
    category: 'tickets',
  },
  {
    id: 'scan-location',
    question: 'Where did my scan go?',
    answer:
      'Scanned tickets live in your collection alongside everything else you have tracked. You can find them on your Profile, and the related movie or show will be marked as watched on the date of the screening.\n\nIf a scan does not show up right away, it may still be processing. Pull to refresh your profile or check your network connection.',
    category: 'tickets',
  },
  {
    id: 'change-theme',
    question: 'Can I change the app theme?',
    answer:
      'Yes. Go to Settings and look under App Preferences for Appearance. You can choose Light, Dark, or System.\n\nSystem will match whatever appearance mode your phone is using and switch automatically when your device does.',
    category: 'account',
  },
  {
    id: 'delete-account',
    question: 'How do I delete my account?',
    answer:
      'Go to Settings, scroll to the Account section, and tap Delete Account. You will be asked to confirm before anything is removed.\n\nDeleting your account permanently removes your profile, collection, reviews, and follows. This cannot be undone.',
    category: 'account',
  },
  {
    id: 'movie-not-saving',
    question: "Why didn't my movie save?",
    answer:
      'The most common cause is a dropped network connection while saving. Check that you are online and try the action again — your changes will sync once the app reaches our servers.\n\nIf the problem keeps happening, try signing out and back in, or use Report a Bug below so we can take a look.',
    category: 'tracking',
  },
  {
    id: 'reviews-ratings',
    question: 'How do reviews / ratings work?',
    answer:
      'When you mark a movie or show as watched, PocketStubs can prompt you for a First Take — a short review and a rating. You can toggle that prompt under Settings → App Preferences.\n\nReviews respect the visibility you choose (Public, Followers Only, or Private). You can change the default for new reviews in Settings → Review Visibility.',
    category: 'social',
  },
  {
    id: 'connect-friends',
    question: 'How do I connect with friends?',
    answer:
      'Use the search to find a friend by username, then tap Follow on their profile. Once they follow you back (or accept your request if they are private), their activity will appear in your Feed.\n\nYou can manage who can follow you under Settings → Private Account.',
    category: 'social',
  },
  {
    id: 'premium-includes',
    question: 'What does premium include?',
    answer:
      'PocketStubs+ unlocks the full feature set: an ad-free experience, advanced analytics, unlimited custom lists, and early access to new features as we ship them.\n\nYou can see the full list and current pricing under Settings → Subscription → Upgrade.',
    category: 'premium',
  },
  {
    id: 'export-data',
    question: 'How do I export my data?',
    answer:
      'Go to Settings → Integrations → Export Collection. PocketStubs will generate a CSV of your tracked movies and shows and share it via your device share sheet.\n\nYou can use the exported file with Letterboxd, a spreadsheet app, or just keep it as a personal backup.',
    category: 'tracking',
  },
  {
    id: 'reset-password',
    question: 'Reset password / change email?',
    answer:
      'To change your password while signed in, go to Settings → Change Password. If you forgot your password, use the "Forgot password?" link on the sign-in screen and we will email you a reset link.\n\nTo change the email on your account, contact support — self-serve email changes are not yet available in-app.',
    category: 'account',
  },
];
