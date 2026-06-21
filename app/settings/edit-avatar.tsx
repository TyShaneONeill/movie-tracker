import { router } from 'expo-router';
import { AvatarBuilder } from '@/components/avatar-builder/avatar-builder';

export default function EditAvatarScreen() {
  return <AvatarBuilder onDone={() => router.back()} />;
}
